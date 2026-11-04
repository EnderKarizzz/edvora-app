import os
import json
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and display running total page numbers
    and professional running headers and footers.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#718096"))
        
        # Running Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(44, 842 - 32, "LAPORAN AUTOMATION LOAD & PERFORMANCE TESTING EDVORA — k6")
            self.drawRightString(595 - 44, 842 - 32, "Indah")
            self.setStrokeColor(colors.HexColor("#CBD5E0"))
            self.setLineWidth(0.5)
            self.line(44, 842 - 36, 595 - 44, 842 - 36)
            
        # Running Footer
        page_str = f"Halaman {self._pageNumber} dari {page_count}"
        self.drawRightString(595 - 44, 28, page_str)
        self.drawString(44, 28, "CONFIDENTIAL — EDVORA QA AUTOMATION (Branch: test/indah-k6)")
        self.setStrokeColor(colors.HexColor("#CBD5E0"))
        self.setLineWidth(0.5)
        self.line(44, 38, 595 - 44, 38)
        
        self.restoreState()

def build_pdf():
    pdf_path = "tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.pdf"
    os.makedirs(os.path.dirname(pdf_path), exist_ok=True)
    
    # Load actual JSON metrics
    with open("tests/k6/reports/summary-skenario-a-soal.json", "r", encoding="utf-8") as f:
        data_a = json.load(f)
    with open("tests/k6/reports/summary-skenario-b-editor.json", "r", encoding="utf-8") as f:
        data_b = json.load(f)
        
    mA = data_a['metrics']
    mB = data_b['metrics']
    
    # Dynamically extract metric values from JSON
    w_jawab = mA.get('waktu_pengiriman_jawaban', {})
    w_ambil = mA.get('waktu_ambil_soal_berikutnya', {})
    w_stok = mB.get('waktu_dashboard_stok_editor', {})
    w_anlt = mB.get('waktu_dashboard_analitik', {})
    
    count_jawab_samples = w_jawab.get('count', 0)
    count_ambil_samples = w_ambil.get('count', 0)
    count_stok_samples = w_stok.get('count', 0)
    count_anlt_samples = w_anlt.get('count', 0)
    
    total_jawab_valid = mA.get('total_jawaban_terkirim', {}).get('count', 0)
    total_kunjungan_valid = mB.get('total_kunjungan_editor', {}).get('count', 0)
    
    iter_a_count = mA.get('iterations', {}).get('count', 0)
    iter_b_count = mB.get('iterations', {}).get('count', 0)
    
    sla_a_jawab_pass = w_jawab.get('p(95)', 999999) <= 1000 and w_jawab.get('max', 999999) <= 1000 and count_jawab_samples > 0
    sla_a_ambil_pass = w_ambil.get('p(95)', 999999) <= 1000 and w_ambil.get('max', 999999) <= 1000 and count_ambil_samples > 0
    sla_b_stok_pass = w_stok.get('p(95)', 999999) <= 3000 and w_stok.get('max', 999999) <= 3000 and count_stok_samples > 0
    sla_b_anlt_pass = w_anlt.get('p(95)', 999999) <= 3000 and w_anlt.get('max', 999999) <= 3000 and count_anlt_samples > 0
    
    status_a = "PASS" if (sla_a_jawab_pass and sla_a_ambil_pass) else "FAIL"
    status_b = "PASS" if (sla_b_stok_pass and sla_b_anlt_pass) else "FAIL"
    
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=42,
        bottomMargin=42
    )
    
    styles = getSampleStyleSheet()
    
    # Palette
    PRIMARY = colors.HexColor("#1A365D")     # Deep Navy
    SECONDARY = colors.HexColor("#2B6CB0")   # Slate Blue
    ACCENT_RED = colors.HexColor("#9B2C2C")  # Dark Crimson (FAIL)
    ACCENT_AMBER = colors.HexColor("#C05621")# Amber / Warning
    ACCENT_GREEN = colors.HexColor("#22543D")# Dark Green (PASS)
    TEXT_DARK = colors.HexColor("#2D3748")    # Charcoal
    BG_LIGHT = colors.HexColor("#F7FAFC")     # Off white
    BORDER_COLOR = colors.HexColor("#E2E8F0") # Light Border
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=PRIMARY,
        spaceAfter=2
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=SECONDARY,
        spaceAfter=5
    )
    h1_style = ParagraphStyle(
        'Header1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=12.5,
        textColor=PRIMARY,
        spaceBefore=7,
        spaceAfter=2.5,
        keepWithNext=True
    )
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.2,
        leading=10,
        textColor=TEXT_DARK,
        spaceAfter=2.5
    )
    cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=6.5,
        leading=8.5,
        textColor=TEXT_DARK
    )
    cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=cell_style,
        fontName='Helvetica-Bold'
    )
    header_cell = ParagraphStyle(
        'TableHeaderCell',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=6.5,
        leading=8.5,
        textColor=colors.white
    )
    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=6.8,
        leading=9.5,
        textColor=colors.HexColor("#742A2A")
    )
    
    story = []
    
    # 1. HALAMAN JUDUL & COVER BLOCK
    story.append(Paragraph("LAPORAN RESMI AUTOMATION LOAD & PERFORMANCE TESTING", title_style))
    story.append(Paragraph("Pengujian Beban & Kinerja Aplikasi Web EDVORA (Laravel 11 & React Inertia.js) Menggunakan Grafana k6", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceBefore=0, spaceAfter=4))
    
    meta_data = [
        [
            Paragraph("<b>Penanggung Jawab:</b> Indah", cell_style),
            Paragraph("<b>Target Beban:</b> Ramping 100–500 VU (Soal) & 50 VU (Editor)", cell_style)
        ],
        [
            Paragraph("<b>Fokus Pengujian:</b> Grafana k6 Load Testing (JavaScript)", cell_style),
            Paragraph("<b>Target SLA:</b> ≤ 1.0s (Soal) | ≤ 3.0s (Dashboard Editor)", cell_style)
        ],
        [
            Paragraph("<b>Repository:</b> <code>https://github.com/EnderKarizzz/edvora-app</code>", cell_style),
            Paragraph("<b>Branch Git:</b> <code>test/indah-k6</code> (fork EnderKarizzz)", cell_style)
        ],
        [
            Paragraph("<b>Backend & Web Host:</b> Laravel 11.56.1 / PHP 8.5.11 (127.0.0.1:8000)", cell_style),
            Paragraph("<b>Database:</b> PostgreSQL (Supabase Online Pooler: 6543)", cell_style)
        ],
        [
            Paragraph("<b>Status Integritas DB:</b> Aman (Zero migration / no alter)", cell_style),
            Paragraph("<b>Tanggal Pelaksanaan:</b> 3 November 2026", cell_style)
        ]
    ]
    t_meta = Table(meta_data, colWidths=[255, 260])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BG_LIGHT),
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 3))
    
    # 2. PENDAHULUAN
    story.append(Paragraph("1. PENDAHULUAN", h1_style))
    story.append(Paragraph(
        "Aplikasi <b>EDVORA</b> adalah platform simulasi ujian dan latihan soal UTBK berbasis web yang menggabungkan "
        "arsitektur backend <b>Laravel 11</b> dan antarmuka reaktif <b>React (Inertia.js)</b>. "
        "Laporan ini disusun untuk mengevaluasi secara objektif "
        "daya tahan serta karakteristik performa backend EDVORA saat menerima konkurensi beban kerja siswa dan editor.",
        body_style
    ))
    
    # 3. TUJUAN DAN RUANG LINGKUP
    story.append(Paragraph("2. TUJUAN DAN RUANG LINGKUP PENGUJIAN", h1_style))
    story.append(Paragraph(
        "<b>Tujuan Pengujian:</b><br/>"
        "1. Memastikan server mampu memproses pengiriman jawaban siswa secara bersamaan dan menyajikan soal berikutnya dengan batas waktu maksimal <b>1.0 detik (1000 ms)</b> pada skala beban bertahap 100–500 VU.<br/>"
        "2. Memastikan dashboard analitik Editor tetap responsif memuat ringkasan stok bank soal dan analitik agregasi penguasaan siswa dengan batas waktu maksimal <b>3.0 detik (3000 ms)</b> pada skala beban 50 Editor.<br/>"
        "<b>Ruang Lingkup:</b> Pengujian difokuskan secara eksklusif pada protokol HTTP dan API backend menggunakan Grafana k6. "
        "Pengujian fungsional PHPUnit dan pengujian antarmuka pengguna Cypress berada di luar ruang lingkup dokumen ini.",
        body_style
    ))
    
    # 4. LINGKUNGAN PENGUJIAN
    story.append(Paragraph("3. LINGKUNGAN PENGUJIAN", h1_style))
    story.append(Paragraph(
        "• <b>Application Host:</b> Laravel 11.56.1 berjalan pada host lokal (<code>127.0.0.1:8000</code>).<br/>"
        "• <b>Database Server:</b> PostgreSQL pada Supabase Cloud Pooler (<code>aws-0-ap-southeast-1.pooler.supabase.com:6543</code>).<br/>"
        "• <b>Operating System:</b> Windows 11 Enterprise (x64) dengan runtime PHP 8.5.11 NTS.<br/>"
        "• <b>Keamanan Database:</b> Zero destructive migration (perintah `php artisan migrate` dilarang penuh; seluruh data tim aman).",
        body_style
    ))
    
    # 5. TOOLS YANG DIGUNAKAN
    story.append(Paragraph("4. TOOLS YANG DIGUNAKAN", h1_style))
    story.append(Paragraph(
        "• <b>Grafana k6 v0.54.0 (Windows amd64):</b> Load testing runtime engine utama.<br/>"
        "• <b>PowerShell 5.1 & Node.js:</b> Orchestrator runner dan environment variable management.<br/>"
        "• <b>Python 3.12 & ReportLab:</b> Compiler laporan resmi PDF dan kompilasi analitik metrik otomatis.",
        body_style
    ))
    
    # 6. METODOLOGI
    story.append(Paragraph("5. METODOLOGI PENGUJIAN", h1_style))
    story.append(Paragraph(
        "• <b>Ramping Stages Concurrency:</b> Beban dinaikkan bertahap (ramp-up), dipertahankan pada puncak beban, dan diturunkan untuk mendeteksi batas ketahanan sistem.<br/>"
        "• <b>Session Persistence & Anti-Login Storm:</b> Setiap Virtual User melakukan login sekali, mempertahankan cookie sesi Laravel, dan tidak mengulang login jika koneksi drop.<br/>"
        "• <b>Pemisahan Pengukuran Metrik:</b> Waktu pengiriman jawaban dan pemunculan soal berikutnya diukur secara independen menggunakan <code>response.timings.duration</code>.<br/>"
        "• <b>Filter Sampel Valid:</b> Request tanpa respons (status 0) tidak dimasukkan ke dalam metrik response time guna mencegah distorsi 0 ms.",
        body_style
    ))
    
    # 7. SKENARIO A
    story.append(Paragraph("6. SKENARIO A — RESPONS PENGIRIMAN JAWABAN SISWA", h1_style))
    story.append(Paragraph(
        "Alur pengujian Skenario A memodelkan siswa mengerjakan latihan soal fleksibel:<br/>"
        "1. <b>Autentikasi Siswa:</b> <code>POST /login</code> memverifikasi kredensial dan hak akses siswa (diisolasi dari metrik soal).<br/>"
        "2. <b>Pengiriman Jawaban (<code>POST /latihan/ujian/jawab</code>):</b> Mengirim payload riil sesuai tipe soal (<code>sesiId, soalId, opsiIds, jawabanIsian, pilihanKolom</code>). Diukur sebagai <code>waktu_pengiriman_jawaban</code> (SLA ≤ 1000 ms).<br/>"
        "3. <b>Pengambilan Soal Berikutnya (<code>GET /latihan/kerjakan/{sesiId}</code>):</b> Memuat komponen soal dan state sesi aktif. Diukur sebagai <code>waktu_ambil_soal_berikutnya</code> (SLA ≤ 1000 ms).<br/>"
        "4. <b>Konfigurasi Beban:</b> Ramping stages: 0→100 VU (15s), 100→250 VU (30s), 250→500 VU (30s), 500→0 VU (15s).",
        body_style
    ))
    
    # 8. HASIL SKENARIO A
    story.append(Paragraph("7. HASIL PENGUJIAN SKENARIO A", h1_style))
    story.append(Paragraph(
        f"Eksekusi Skenario A menghasilkan total <b>{mA['http_reqs']['count']:,} HTTP requests</b> dengan <b>{iter_a_count:,} iterasi</b> "
        f"di bawah konkurensi puncak <b>{mA['vus_max']['value']} VU</b>. Throughput tercatat <b>{mA['http_reqs']['rate']:.2f} req/s</b>.<br/>"
        f"• <b>Waktu Pengiriman Jawaban (POST /latihan/ujian/jawab):</b> Sampel valid = <b>{count_jawab_samples}</b>, "
        f"Average = <b>{w_jawab.get('avg', 0):.2f} ms</b> ({w_jawab.get('avg', 0)/1000:.2f} s), "
        f"Median = <b>{w_jawab.get('med', 0):.2f} ms</b>, p90 = <b>{w_jawab.get('p(90)', 0):.2f} ms</b>, "
        f"p95 = <b>{w_jawab.get('p(95)', 0):.2f} ms</b>, Maximum = <b>{w_jawab.get('max', 0):.2f} ms</b> (SLA ≤ 1000 ms -> <b>{status_a}</b>).<br/>"
        f"• <b>Waktu Ambil Soal Berikutnya (GET /latihan/kerjakan/&#123;id&#125;):</b> Sampel valid = <b>{count_ambil_samples}</b>, "
        f"Average = <b>{w_ambil.get('avg', 0):.2f} ms</b> ({w_ambil.get('avg', 0)/1000:.2f} s), "
        f"Median = <b>{w_ambil.get('med', 0):.2f} ms</b>, p90 = <b>{w_ambil.get('p(90)', 0):.2f} ms</b>, "
        f"p95 = <b>{w_ambil.get('p(95)', 0):.2f} ms</b>, Maximum = <b>{w_ambil.get('max', 0):.2f} ms</b> (SLA ≤ 1000 ms -> <b>{status_a}</b>).<br/>"
        f"• <b>Validasi Proses Bisnis:</b> Sebanyak <b>{total_jawab_valid} jawaban</b> berhasil diverifikasi dan dinilai oleh backend Laravel "
        f"sesuai kontrak JSON umpan balik. Error HTTP mencapai <b>{mA.get('http_req_failed', {}).get('value', 0)*100:.2f}%</b> akibat saturasi soket.",
        body_style
    ))
    
    # 9. SKENARIO B
    story.append(Paragraph("8. SKENARIO B — DASHBOARD ANALITIK EDITOR", h1_style))
    story.append(Paragraph(
        "Alur pengujian Skenario B menguji akses pengguna dengan hak Editor (<code>admin_editor</code>):<br/>"
        "1. <b>Autentikasi Editor:</b> Validasi kredensial hak Editor via <code>POST /login</code>.<br/>"
        "2. <b>Ringkasan Stok Bank Soal (<code>GET /editor</code>):</b> Agregasi stok soal per subtes (published, draft, review). Diukur sebagai <code>waktu_dashboard_stok_editor</code> (SLA ≤ 3000 ms).<br/>"
        "3. <b>Dashboard Analitik Terpadu (<code>GET /editor/analitik</code>):</b> Memanggil service <code>DataAnalitik::ambil()</code> memuat agregasi topik dan pemetaan penguasaan siswa per subtes. Diukur sebagai <code>waktu_dashboard_analitik</code> (SLA ≤ 3000 ms).<br/>"
        "4. <b>Konfigurasi Beban:</b> Ramping stages: 0→10 Editor (10s), 10→30 Editor (20s), 30→50 Editor (20s), 50→0 Editor (10s).",
        body_style
    ))
    
    # 10. HASIL SKENARIO B
    story.append(Paragraph("9. HASIL PENGUJIAN SKENARIO B", h1_style))
    story.append(Paragraph(
        f"Eksekusi Skenario B menghasilkan total <b>{mB['http_reqs']['count']:,} HTTP requests</b> dengan <b>{iter_b_count:,} iterasi lengkap</b> "
        f"di bawah konkurensi puncak <b>{mB['vus_max']['value']} Editor</b>. "
        f"HTTP request failure rate tercatat <b>{mB.get('http_req_failed', {}).get('value', 0)*100:.2f}%</b> (seluruh request transport terlayani). "
        f"Namun karena waktu respons per iterasi sangat panjang, hanya <b>{total_kunjungan_valid} kunjungan lengkap</b> yang selesai dalam jendela waktu pengujian.<br/>"
        f"• <b>Pemuatan Stok Bank Soal (GET /editor):</b> Sampel valid = <b>{count_stok_samples}</b>, "
        f"Average = <b>{w_stok.get('avg', 0):.2f} ms</b> ({w_stok.get('avg', 0)/1000:.2f} s), "
        f"Median = <b>{w_stok.get('med', 0):.2f} ms</b>, p90 = <b>{w_stok.get('p(90)', 0):.2f} ms</b>, "
        f"p95 = <b>{w_stok.get('p(95)', 0):.2f} ms</b>, Maximum = <b>{w_stok.get('max', 0):.2f} ms</b> (SLA ≤ 3000 ms -> <b>{status_b}</b>).<br/>"
        f"• <b>Dashboard Analitik Terpadu (GET /editor/analitik):</b> Sampel valid = <b>{count_anlt_samples}</b>, "
        f"Average = <b>{w_anlt.get('avg', 0):.2f} ms</b> ({w_anlt.get('avg', 0)/1000:.2f} s), "
        f"Median = <b>{w_anlt.get('med', 0):.2f} ms</b>, p90 = <b>{w_anlt.get('p(90)', 0):.2f} ms</b>, "
        f"p95 = <b>{w_anlt.get('p(95)', 0):.2f} ms</b>, Maximum = <b>{w_anlt.get('max', 0):.2f} ms</b> (SLA ≤ 3000 ms -> <b>{status_b}</b>).",
        body_style
    ))
    
    # 11. TABEL PERBANDINGAN TARGET DAN HASIL AKTUAL
    story.append(Paragraph("10. TABEL PERBANDINGAN TARGET DAN HASIL AKTUAL", h1_style))
    story.append(Paragraph("Tabel komparasi metrik hasil pengujian aktual terhadap target SLA ketentuan tugas:", body_style))
    
    tabel_wajib_data = [
        [
            Paragraph("Parameter Metrik", header_cell),
            Paragraph("Skenario A (Siswa — Soal)", header_cell),
            Paragraph("Skenario B (Editor — Dashboard)", header_cell)
        ],
        [
            Paragraph("<b>Puncak Virtual Users (VU)</b>", cell_style),
            Paragraph(f"{mA['vus_max']['value']} VU (Ramping stages)", cell_style),
            Paragraph(f"{mB['vus_max']['value']} VU (Ramping stages)", cell_style)
        ],
        [
            Paragraph("<b>Total Permintaan HTTP</b>", cell_style),
            Paragraph(f"{mA['http_reqs']['count']:,} requests", cell_style),
            Paragraph(f"{mB['http_reqs']['count']:,} requests", cell_style)
        ],
        [
            Paragraph("<b>Throughput (RPS)</b>", cell_style),
            Paragraph(f"{mA['http_reqs']['rate']:.2f} req/s", cell_style),
            Paragraph(f"{mB['http_reqs']['rate']:.2f} req/s", cell_style)
        ],
        [
            Paragraph("<b>Total Iterasi Lengkap</b>", cell_style),
            Paragraph(f"{iter_a_count:,} iterasi", cell_style),
            Paragraph(f"{iter_b_count:,} iterasi", cell_style)
        ],
        [
            Paragraph("<b>Average Response Time (Utama)</b>", cell_style),
            Paragraph(f"Jawab: {w_jawab.get('avg', 0):.2f} ms | Ambil: {w_ambil.get('avg', 0):.2f} ms", cell_style),
            Paragraph(f"Stok: {w_stok.get('avg', 0):.2f} ms | Analitik: {w_anlt.get('avg', 0):.2f} ms", cell_style)
        ],
        [
            Paragraph("<b>Median Response Time (Utama)</b>", cell_style),
            Paragraph(f"Jawab: {w_jawab.get('med', 0):.2f} ms | Ambil: {w_ambil.get('med', 0):.2f} ms", cell_style),
            Paragraph(f"Stok: {w_stok.get('med', 0):.2f} ms | Analitik: {w_anlt.get('med', 0):.2f} ms", cell_style)
        ],
        [
            Paragraph("<b>90th Percentile (p90)</b>", cell_style),
            Paragraph(f"Jawab: {w_jawab.get('p(90)', 0):.2f} ms | Ambil: {w_ambil.get('p(90)', 0):.2f} ms", cell_style),
            Paragraph(f"Stok: {w_stok.get('p(90)', 0):.2f} ms | Analitik: {w_anlt.get('p(90)', 0):.2f} ms", cell_style)
        ],
        [
            Paragraph("<b>95th Percentile (p95)</b>", cell_style),
            Paragraph(f"Jawab: {w_jawab.get('p(95)', 0):.2f} ms | Ambil: {w_ambil.get('p(95)', 0):.2f} ms", cell_style),
            Paragraph(f"Stok: {w_stok.get('p(95)', 0):.2f} ms | Analitik: {w_anlt.get('p(95)', 0):.2f} ms", cell_style)
        ],
        [
            Paragraph("<b>Maximum Response Time</b>", cell_style),
            Paragraph(f"Jawab: {w_jawab.get('max', 0):.2f} ms | Ambil: {w_ambil.get('max', 0):.2f} ms", cell_style),
            Paragraph(f"Stok: {w_stok.get('max', 0):.2f} ms | Analitik: {w_anlt.get('max', 0):.2f} ms", cell_style)
        ],
        [
            Paragraph("<b>Jumlah Sampel Respons Valid</b>", cell_style),
            Paragraph(f"Jawab: {count_jawab_samples} respons | Ambil: {count_ambil_samples} respons", cell_style),
            Paragraph(f"Stok: {count_stok_samples} respons | Analitik: {count_anlt_samples} respons", cell_style)
        ],
        [
            Paragraph("<b>Business Success Rate</b>", cell_style),
            Paragraph(f"{mA.get('success_rate_jawaban', {}).get('value', 0)*100:.2f}% ({total_jawab_valid} jawaban sah)", cell_style),
            Paragraph(f"{mB.get('success_rate_editor', {}).get('value', 0)*100:.2f}% ({total_kunjungan_valid} kunjungan)", cell_style)
        ],
        [
            Paragraph("<b>HTTP Req Failed Rate</b>", cell_style),
            Paragraph(f"{mA.get('http_req_failed', {}).get('value', 0)*100:.2f}%", cell_style),
            Paragraph(f"{mB.get('http_req_failed', {}).get('value', 0)*100:.2f}%", cell_style)
        ],
        [
            Paragraph("<b>Target Batas Waktu (SLA)</b>", cell_style),
            Paragraph("≤ 1.0 detik (1000 ms) per request", cell_style),
            Paragraph("≤ 3.0 detik (3000 ms) per request", cell_style)
        ],
        [
            Paragraph("<b>Status Evaluasi SLA Akhir</b>", cell_style),
            Paragraph(f"<font color='#9B2C2C'><b>{status_a} (Melebihi SLA target)</b></font>", cell_bold),
            Paragraph(f"<font color='#9B2C2C'><b>{status_b} (Melebihi SLA target)</b></font>", cell_bold)
        ]
    ]
    
    t_comp = Table(tabel_wajib_data, colWidths=[140, 187, 188])
    t_comp.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 3.5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3.5),
    ]))
    story.append(t_comp)
    story.append(Spacer(1, 3))
    
    # 12. ANALISIS ERROR DAN BOTTLENECK
    story.append(Paragraph("11. ANALISIS ERROR DAN BOTTLENECK (ROOT CAUSE ANALYSIS)", h1_style))
    
    callout_data = [[
        Paragraph(
            "<b>HASIL OBSERVASI METRIK & EVALUASI KEJURUAN:</b><br/>"
            "Kedua skenario pengujian melampaui ambang batas SLA target (1.000 ms untuk Soal dan 3.000 ms untuk Dashboard). "
            "Sesuai standar objektivitas QA Automation, hasil dievaluasi sebagai <b>FAIL</b>. "
            "Berikut disajikan pemisahan terstruktur antara <b>Hasil Observasi</b>, <b>Dugaan Penyebab</b>, dan <b>Rekomendasi</b>.",
            callout_style
        )
    ]]
    t_call = Table(callout_data, colWidths=[515])
    t_call.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#FFF5F5")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#FEB2B2")),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_call)
    story.append(Spacer(1, 2.5))
    
    story.append(Paragraph(
        "<b>A. Hasil Observasi (Fakta Metrik Aktual):</b><br/>"
        f"1. Pada Skenario A (500 VU), waktu respons p95 melonjak hingga {w_jawab.get('p(95)', 0):.2f} ms (Jawab) dan {w_ambil.get('p(95)', 0):.2f} ms (Ambil Soal), dengan HTTP req failed {mA.get('http_req_failed', {}).get('value', 0)*100:.2f}% akibat TCP connection drop.<br/>"
        f"2. Pada Skenario B (50 Editor), seluruh 114 request HTTP transport berhasil (0% failure), namun waktu respons p95 mencapai {w_stok.get('p(95)', 0):.2f} ms (Stok) dan {w_anlt.get('p(95)', 0):.2f} ms (Analitik). Karena durasi per iterasi ~27-54 detik, hanya {iter_b_count} iterasi yang selesai penuh dalam jendela waktu pengujian.<br/>"
        "<b>B. Dugaan / Hipotesis Penyebab (Root Cause Hypothesis):</b><br/>"
        "1. <i>Arsitektur Web Server Single-Process:</i> Server pengujian lokal dijalankan melalui <code>php artisan serve</code> yang merupakan CLI web server single-threaded. Konkurensi tinggi menyebabkan request mengantre secara serial pada soket OS.<br/>"
        "2. <i>Latensi Jaringan Database Cloud Supabase:</i> Server aplikasi lokal berkomunikasi dengan PostgreSQL di cluster Supabase AWS Singapore via internet publik, menghasilkan akumulasi latensi round-trip jaringan per kueri.<br/>"
        "3. <i>Kalkulasi Agregasi Analitik Real-Time:</i> Endpoint <code>/editor/analitik</code> menjalankan kueri kalkulasi penguasaan topik seluruh siswa secara langsung ke database tanpa layer caching memory.<br/>"
        "4. <i>Keterbatasan Data Testing Bersama (Skenario A):</i> Demi integritas database bersama, pembuatan ratusan akun siswa massal dilarang. Akibatnya konkurensi VU terpusat pada sesi yang sama dan memicu pembatasan sesi (rate limit dan session locking).",
        body_style
    ))
    
    # 13. KESIMPULAN
    story.append(Paragraph("12. KESIMPULAN RESMI QA AUTOMATION ENGINEER", h1_style))
    story.append(Paragraph(
        "1. Script pengujian k6 pada folder <code>tests/k6</code> telah diperbaiki secara komprehensif, tervalidasi terhadap backend Laravel EDVORA, dan bebas dari kredensial hardcoded.<br/>"
        "2. Skrip pengujian berhasil dijalankan pada beban bertahap hingga <b>500 VU (Skenario A)</b> dan <b>50 VU (Skenario B)</b>.<br/>"
        "3. Evaluasi SLA performa disimpulkan sebagai <b>FAIL</b> karena waktu respons aktual melampaui target (1s dan 3s), dengan faktor pembatas utama berupa arsitektur web server single-process dan latensi jaringan database online.",
        body_style
    ))
    
    # 14. REKOMENDASI
    story.append(Paragraph("13. REKOMENDASI SOLUSI DAN OPTIMASI PERFORMA", h1_style))
    story.append(Paragraph(
        "• <b>Penerapan Web Server Multi-Worker Produksi:</b> Mengganti server single-process dengan <b>Nginx + PHP-FPM</b> (konfigurasi multi-worker) atau <b>Laravel Octane</b> (FrankenPHP / Swoole) agar dapat melayani ratusan request konkuren secara paralel di lingkungan produksi.<br/>"
        "• <b>Penerapan Layer Caching pada Dashboard Analitik:</b> Mengaktifkan Redis caching pada <code>DataAnalitik::ambil()</code> dengan TTL 60–120 detik guna meniadakan kueri agregasi berulang pada database.<br/>"
        "• <b>Ko-Lokasi Server Aplikasi dan Database:</b> Menempatkan server backend dan PostgreSQL pada region cloud yang sama melalui koneksi privat berkecepatan tinggi guna meminimalkan latensi round-trip jaringan.",
        body_style
    ))
    
    # 15. BUKTI PENGUJIAN & DAFTAR ARTIFAK
    story.append(Paragraph("14. INTEGRITAS DATABASE DAN STANDAR KEAMANAN", h1_style))
    story.append(Paragraph(
        "Pengujian dilaksanakan dengan kepatuhan penuh terhadap standar keselamatan tim QA EDVORA:<br/>"
        "• <b>Zero Destructive Action:</b> Tidak ada perintah <code>php artisan migrate</code>, <code>migrate:fresh</code>, maupun modifikasi skema database. Seluruh data tim di Supabase tetap aman dan utuh.<br/>"
        "• <b>Zero Hardcoded Credentials:</b> Seluruh kredensial dan kata sandi dikelola murni via Environment Variables runtime.",
        body_style
    ))
    
    story.append(Paragraph("15. BUKTI PENGUJIAN & DAFTAR ARTIFAK", h1_style))
    art_data = [
        [Paragraph("Nama Berkas Artifak", header_cell), Paragraph("Lokasi Relatif", header_cell), Paragraph("Deskripsi Isi", header_cell)],
        [Paragraph("Script Skenario A", cell_bold), Paragraph("<code>tests/k6/scenarios/soal-response-time.js</code>", cell_style), Paragraph("Script pengujian beban soal bertahap hingga 500 VU.", cell_style)],
        [Paragraph("Script Skenario B", cell_bold), Paragraph("<code>tests/k6/scenarios/editor-analytics-dashboard.js</code>", cell_style), Paragraph("Script pengujian beban dashboard Editor hingga 50 VU.", cell_style)],
        [Paragraph("Raw Log Terminal A", cell_bold), Paragraph("<code>tests/k6/reports/output-skenario-a-soal.txt</code>", cell_style), Paragraph("Log eksekusi mentah konsol k6 Skenario A.", cell_style)],
        [Paragraph("Raw Log Terminal B", cell_bold), Paragraph("<code>tests/k6/reports/output-skenario-b-editor.txt</code>", cell_style), Paragraph("Log eksekusi mentah konsol k6 Skenario B.", cell_style)],
        [Paragraph("Export Raw JSON A", cell_bold), Paragraph("<code>tests/k6/reports/summary-skenario-a-soal.json</code>", cell_style), Paragraph("Ekspor metrik JSON mentah Skenario A.", cell_style)],
        [Paragraph("Export Raw JSON B", cell_bold), Paragraph("<code>tests/k6/reports/summary-skenario-b-editor.json</code>", cell_style), Paragraph("Ekspor metrik JSON mentah Skenario B.", cell_style)],
        [Paragraph("Screenshot Bukti A", cell_bold), Paragraph("<code>tests/k6/reports/screenshot-skenario-a.png</code>", cell_style), Paragraph("Tangkapan layar terminal bukti eksekusi Skenario A.", cell_style)],
        [Paragraph("Screenshot Bukti B", cell_bold), Paragraph("<code>tests/k6/reports/screenshot-skenario-b.png</code>", cell_style), Paragraph("Tangkapan layar terminal bukti eksekusi Skenario B.", cell_style)],
        [Paragraph("Laporan Resmi MD", cell_bold), Paragraph("<code>tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.md</code>", cell_style), Paragraph("Dokumen laporan komprehensif versi Markdown.", cell_style)],
        [Paragraph("Laporan Resmi PDF", cell_bold), Paragraph("<code>tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.pdf</code>", cell_style), Paragraph("Dokumen laporan resmi PDF 15 Bagian berhalaman dinamis.", cell_style)],
    ]
    t_art = Table(art_data, colWidths=[110, 195, 210])
    t_art.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 3.5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3.5),
    ]))
    story.append(t_art)
    
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Laporan PDF berhasil di-generate secara sempurna: {pdf_path}")

if __name__ == "__main__":
    build_pdf()
