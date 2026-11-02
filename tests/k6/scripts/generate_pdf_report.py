import os
import json
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
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
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 792 - 36, "LAPORAN RESMI LOAD & PERFORMANCE TESTING EDVORA — k6")
            self.drawRightString(612 - 54, 792 - 36, "Indah (Senior QA Automation Engineer)")
            self.setStrokeColor(colors.HexColor("#E2E8F0"))
            self.setLineWidth(0.5)
            self.line(54, 792 - 42, 612 - 54, 792 - 42)
            
        # Footer
        page_str = f"Halaman {self._pageNumber} dari {page_count}"
        self.drawRightString(612 - 54, 36, page_str)
        self.drawString(54, 36, "CONFIDENTIAL — EDVORA QA AUTOMATION TEAM (Branch: test/indah-k6)")
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.5)
        self.line(54, 46, 612 - 54, 46)
        
        self.restoreState()

def generate_pdf():
    pdf_path = "tests/k6/reports/LAPORAN_LOAD_TESTING_EDVORA.pdf"
    os.makedirs(os.path.dirname(pdf_path), exist_ok=True)
    
    # Load actual JSON metrics
    with open("tests/k6/reports/summary-skenario-a-soal.json", "r", encoding="utf-8") as f:
        data_a = json.load(f)
    with open("tests/k6/reports/summary-skenario-b-editor.json", "r", encoding="utf-8") as f:
        data_b = json.load(f)
        
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Palette
    PRIMARY = colors.HexColor("#1A365D")   # Deep navy
    SECONDARY = colors.HexColor("#2B6CB0") # Steel blue
    ACCENT_RED = colors.HexColor("#C53030") # Crimson
    ACCENT_GREEN = colors.HexColor("#276749") # Dark green
    TEXT_DARK = colors.HexColor("#2D3748")  # Charcoal
    BG_LIGHT = colors.HexColor("#F7FAFC")
    BORDER_COLOR = colors.HexColor("#E2E8F0")
    
    # Custom typography styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=PRIMARY,
        spaceAfter=4
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=15,
        textColor=SECONDARY,
        spaceAfter=14
    )
    h1_style = ParagraphStyle(
        'Header1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=PRIMARY,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )
    h2_style = ParagraphStyle(
        'Header2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=SECONDARY,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=TEXT_DARK,
        spaceAfter=6
    )
    bullet_style = ParagraphStyle(
        'Bullet',
        parent=body_style,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=3
    )
    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10.5,
        textColor=TEXT_DARK
    )
    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=table_cell_style,
        fontName='Helvetica-Bold'
    )
    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10.5,
        textColor=colors.white
    )
    callout_style = ParagraphStyle(
        'Callout',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#742A2A")
    )

    story = []
    
    # Document Header
    story.append(Paragraph("LAPORAN RESMI AUTOMATION LOAD & PERFORMANCE TESTING", title_style))
    story.append(Paragraph("Aplikasi Web EDVORA (Laravel 11 & React Inertia.js) — Pengujian Berbasis Grafana k6", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY, spaceBefore=0, spaceAfter=10))
    
    # Metadata Box Table
    meta_data = [
        [
            Paragraph("<b>Penanggung Jawab:</b> Indah (Senior QA Automation)", table_cell_style),
            Paragraph("<b>Target Pengujian:</b> Respons Soal & Dashboard Analitik", table_cell_style)
        ],
        [
            Paragraph("<b>Branch Git:</b> <code>test/indah-k6</code> (fork EnderKarizzz)", table_cell_style),
            Paragraph("<b>Tools Pengujian:</b> Grafana k6 v0.54.0 (JavaScript)", table_cell_style)
        ],
        [
            Paragraph("<b>Backend & Web Host:</b> Laravel 11 / PHP 8.5 (127.0.0.1:8000)", table_cell_style),
            Paragraph("<b>Database:</b> PostgreSQL (Supabase Online Pooler)", table_cell_style)
        ],
        [
            Paragraph("<b>Status Integritas DB:</b> Aman (Zero migration/destructive)", table_cell_style),
            Paragraph("<b>Tanggal Eksekusi:</b> 2 November 2026", table_cell_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[250, 254])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BG_LIGHT),
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))
    
    # Section 1
    story.append(Paragraph("1. RINGKASAN EKSEKUTIF & TUJUAN PENGUJIAN", h1_style))
    story.append(Paragraph(
        "Laporan ini mendokumentasikan hasil pengujian beban (*load testing*) dan analisis performa backend "
        "aplikasi web EDVORA sesuai mandat pembagian tugas pengujian otomasi. Pengujian difokuskan secara eksklusif "
        "pada lapisan protokol HTTP dan API backend menggunakan <b>Grafana k6</b> dengan dua skenario kritis:",
        body_style
    ))
    story.append(Paragraph(
        "• <b>Skenario A (Load Testing Soal — Target SLA ≤ 1.0 detik):</b> Menguji ketahanan backend saat menangani pengiriman "
        "jawaban siswa (<code>POST /latihan/ujian/jawab</code>) dan pengambilan soal berikutnya dengan simulasi beban bertahap "
        "hingga <b>500 Virtual Users (VU)</b>.",
        bullet_style
    ))
    story.append(Paragraph(
        "• <b>Skenario B (Beban Dashboard Analitik Editor — Target SLA ≤ 3.0 detik):</b> Menguji kestabilan respons server "
        "saat memuat ringkasan stok bank soal (<code>GET /editor</code>) dan dashboard analitik agregasi penguasaan siswa "
        "(<code>GET /editor/analitik</code>) di bawah konkurensi hingga <b>50 Editor</b>.",
        bullet_style
    ))
    
    # Section 2
    story.append(Paragraph("2. KONFIGURASI BEBAN & KEAMANAN LINGKUNGAN", h1_style))
    story.append(Paragraph(
        "Seluruh script k6 telah dikonfigurasi mengikuti standar keamanan tinggi dan ketetapan database bersama:",
        body_style
    ))
    story.append(Paragraph(
        "• <b>Zero Hardcoded Credentials:</b> Kredensial dan password akun tidak disimpan dalam kode repository, melainkan "
        "diinjeksikan secara dinamis melalui Environment Variables k6 (<code>SISWA_EMAIL</code>, <code>SISWA_PASSWORD</code>, "
        "<code>EDITOR_EMAIL</code>, <code>EDITOR_PASSWORD</code>).",
        bullet_style
    ))
    story.append(Paragraph(
        "• <b>Perlindungan Database Bersama:</b> Tim mematuhi aturan ketat larangan <code>php artisan migrate</code> dan "
        "<code>migrate:fresh</code> guna mencegah penghapusan data bersama di Supabase. Uji beban dilakukan secara terkontrol "
        "tanpa mutasi data destruktif.",
        bullet_style
    ))
    story.append(Paragraph(
        "• <b>Tahapan Beban Bertahap (Ramping Stages):</b><br/>"
        "  - <i>Skenario A (5 Stages, 1m20s):</i> 0→50 VU (10s), 50→100 VU (20s), 100→250 VU (20s), 250→500 VU (20s), ramp-down (10s).<br/>"
        "  - <i>Skenario B (4 Stages, 1m00s):</i> 0→10 VU (10s), 10→30 VU (20s), 30→50 VU (20s), ramp-down (10s).",
        bullet_style
    ))
    
    # Section 3
    story.append(Paragraph("3. TABEL METRIK & HASIL PENGUJIAN AKTUAL", h1_style))
    story.append(Paragraph(
        "Tabel berikut merangkum data metrik aktual yang diekstraksi secara langsung dari file hasil eksekusi k6 "
        "(<code>summary-skenario-a-soal.json</code> dan <code>summary-skenario-b-editor.json</code>):",
        body_style
    ))
    
    mA = data_a['metrics']
    mB = data_b['metrics']
    
    # Metrics Table
    table_metrics_data = [
        [
            Paragraph("Parameter / Metrik Pengujian", table_header_style),
            Paragraph("Target SLA", table_header_style),
            Paragraph("Skenario A (Siswa - 500 VU)", table_header_style),
            Paragraph("Skenario B (Editor - 50 VU)", table_header_style)
        ],
        [
            Paragraph("<b>Target Virtual Users (Max VUs)</b>", table_cell_style),
            Paragraph("100 - 500 VU", table_cell_style),
            Paragraph(f"{mA['vus_max']['value']} VU (Puncak 500)", table_cell_style),
            Paragraph(f"{mB['vus_max']['value']} VU (Puncak 50)", table_cell_style)
        ],
        [
            Paragraph("<b>Total HTTP Requests Terkirim</b>", table_cell_style),
            Paragraph("N/A", table_cell_style),
            Paragraph(f"{mA['http_reqs']['count']:,} requests", table_cell_style),
            Paragraph(f"{mB['http_reqs']['count']:,} requests", table_cell_style)
        ],
        [
            Paragraph("<b>Throughput (RPS)</b>", table_cell_style),
            Paragraph("Tinggi / Stabil", table_cell_style),
            Paragraph(f"{mA['http_reqs']['rate']:.2f} req/s", table_cell_style),
            Paragraph(f"{mB['http_reqs']['rate']:.2f} req/s", table_cell_style)
        ],
        [
            Paragraph("<b>Total Iterasi Selesai</b>", table_cell_style),
            Paragraph("N/A", table_cell_style),
            Paragraph(f"{mA['iterations']['count']:,} iterasi", table_cell_style),
            Paragraph(f"{mB['iterations']['count']:,} iterasi", table_cell_style)
        ],
        [
            Paragraph("<b>Average Response Time (Avg)</b>", table_cell_style),
            Paragraph("A: ≤ 1.0s | B: ≤ 3.0s", table_cell_style),
            Paragraph(f"{mA['http_req_duration']['avg']:.2f} ms ({mA['http_req_duration']['avg']/1000:.2f} s)", table_cell_style),
            Paragraph(f"{mB['http_req_duration']['avg']:.2f} ms ({mB['http_req_duration']['avg']/1000:.3f} s)", table_cell_style)
        ],
        [
            Paragraph("<b>Median Response Time (Med)</b>", table_cell_style),
            Paragraph("A: ≤ 1.0s | B: ≤ 3.0s", table_cell_style),
            Paragraph(f"{mA['http_req_duration']['med']:.2f} ms", table_cell_style),
            Paragraph(f"{mB['http_req_duration']['med']:.2f} ms", table_cell_style)
        ],
        [
            Paragraph("<b>Percentile 90 (p90)</b>", table_cell_style),
            Paragraph("A: ≤ 1.0s | B: ≤ 3.0s", table_cell_style),
            Paragraph(f"{mA['http_req_duration']['p(90)']:.2f} ms", table_cell_style),
            Paragraph(f"{mB['http_req_duration']['p(90)']:.2f} ms", table_cell_style)
        ],
        [
            Paragraph("<b>Percentile 95 (p95)</b>", table_cell_style),
            Paragraph("A: ≤ 1.0s | B: ≤ 3.0s", table_cell_style),
            Paragraph(f"{mA['http_req_duration']['p(95)']:.2f} ms", table_cell_style),
            Paragraph(f"{mB['http_req_duration']['p(95)']:.2f} ms (Dalam SLA)", table_cell_style)
        ],
        [
            Paragraph("<b>Maximum Response Time (Max)</b>", table_cell_style),
            Paragraph("A: ≤ 1.0s | B: ≤ 3.0s", table_cell_style),
            Paragraph(f"{mA['http_req_duration']['max']:.2f} ms", table_cell_style),
            Paragraph(f"{mB['http_req_duration']['max']:.2f} ms", table_cell_style)
        ],
        [
            Paragraph("<b>Tingkat Keberhasilan Validasi Checks</b>", table_cell_style),
            Paragraph("≥ 95%", table_cell_style),
            Paragraph(f"{mA['checks']['passes']:,} / {mA['checks']['passes']+mA['checks']['fails']:,} ({mA['checks']['value']*100:.1f}%)", table_cell_style),
            Paragraph(f"{mB['checks']['passes']:,} / {mB['checks']['passes']+mB['checks']['fails']:,} ({mB['checks']['value']*100:.1f}%)", table_cell_style)
        ],
        [
            Paragraph("<b>Error Otentikasi (HTTP 401/422)</b>", table_cell_style),
            Paragraph("0%", table_cell_style),
            Paragraph(f"{mA['error_auth_401']['passes']} VU (HTTP 422)", table_cell_style),
            Paragraph(f"{mB['error_auth_401']['passes']} VU (HTTP 422)", table_cell_style)
        ],
        [
            Paragraph("<b>Server Internal Error (HTTP 5xx)</b>", table_cell_style),
            Paragraph("< 1%", table_cell_style),
            Paragraph("0 (0.00%) — Bersih", table_cell_style),
            Paragraph("0 (0.00%) — Bersih", table_cell_style)
        ],
        [
            Paragraph("<b>Status Thresholds & Kelulusan</b>", table_cell_style),
            Paragraph("Semua Lulus", table_cell_style),
            Paragraph("<font color='#C53030'><b>BELUM LULUS (FAIL)</b></font>", table_cell_style),
            Paragraph("<font color='#C53030'><b>BELUM LULUS (FAIL)</b></font>", table_cell_style)
        ]
    ]
    
    t_metrics = Table(table_metrics_data, colWidths=[140, 90, 137, 137])
    t_metrics.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t_metrics)
    story.append(Spacer(1, 10))
    
    # Section 4
    story.append(Paragraph("4. ANALISIS TEKNIS & TEMUAN BOTTLENECK ARSITEKTUR", h1_style))
    story.append(Paragraph(
        "Berdasarkan hasil pengujian aktual dan investigasi menyeluruh pada basis kode Laravel, tim QA mengidentifikasi "
        "tiga temuan kritis yang melandasi status evaluasi pengujian:",
        body_style
    ))
    
    # Callout Box: DB State
    callout_data = [[
        Paragraph(
            "<b>TEMUAN 1: Kendala Kredensial pada Database Bersama (Supabase Remote)</b><br/>"
            "Pada commit <code>dc33f43</code>, skema database remote di Supabase di-refactor menjadi satu file migrasi terpadu. "
            "Namun, seeder akun belum dieksekusi sehingga tabel <code>users</code> memiliki 0 records. Akibatnya, kredensial resmi "
            "pengujian (<code>sim001@simulasi.test</code> dan <code>dapa@gmail.com</code>) ditolak oleh Laravel dengan "
            "status <b>HTTP 422 Unprocessable Entity</b> (<i>'These credentials do not match our records'</i>). "
            "Sesuai mandat database bersama, tim QA <b>dilarang menjalankan <code>php artisan migrate</code> / seeder</b> tanpa izin tim, "
            "sehingga kegagalan otentikasi dilaporkan secara jujur dan objektif apa adanya tanpa manipulasi hasil.",
            callout_style
        )
    ]]
    c_table = Table(callout_data, colWidths=[504])
    c_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#FFF5F5")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#FEB2B2")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(c_table)
    story.append(Spacer(1, 6))
    
    story.append(Paragraph(
        "<b>TEMUAN 2: Batasan Konkurensi Development Server PHP Built-in (500 VUs)</b><br/>"
        "Perintah <code>php artisan serve</code> menggunakan PHP built-in web server yang beroperasi dalam arsitektur "
        "<i>single-threaded / single-process</i> tanpa worker pools. Ketika lonjakan beban mencapai 250 hingga 500 VUs "
        "secara bersamaan pada Skenario A, sistem mengalami TCP backlog saturation sehingga 1,933 request mengalami "
        "koneksi ditolak (<i>connection refused</i>). Sebaliknya, pada Skenario B dengan batas 50 VUs, dev server mampu "
        "melayani 100% request tanpa koneksi terputus dengan p95 sebesar <b>313.65 ms</b>.",
        body_style
    ))
    
    story.append(Paragraph(
        "<b>TEMUAN 3: Bottleneck Middleware Rate Limiter & Session Blocking</b><br/>"
        "1. <b>Rate Limiter (<code>throttle:30,1</code>):</b> Rute <code>POST /latihan/ujian/jawab</code> memiliki middleware "
        "pembatasan 30 request/menit per IP/user. Pengujian 500 VU akan langsung memicu error <b>HTTP 429 Too Many Requests</b>.<br/>"
        "2. <b>Atomic Session Locking (<code>block(10, 10)</code>):</b> Rute ujian menerapkan penguncian sesi atomik. Script k6 "
        "telah dikonfigurasi menggunakan isolasi cookie jar per VU untuk menghindari antrean lock antar pengguna.",
        body_style
    ))
    
    # Section 5
    story.append(Paragraph("5. REKOMENDASI PRODUCTION READINESS & RENCANA TINDAK LANJUT", h1_style))
    story.append(Paragraph(
        "1. <b>Penyediaan Akun Pengujian Khusus:</b> Administrator database perlu melakukan seeding akun uji "
        "(<code>sim001@simulasi.test</code> dan <code>dapa@gmail.com</code>) atau menyediakan 100 akun siswa terpisah pada database pengujian.<br/>"
        "2. <b>Deployment Staging dengan PHP-FPM / Laravel Octane:</b> Untuk memvalidasi beban riil 500 siswa serentak, lingkungan "
        "pengujian harus menggunakan Nginx + PHP-FPM (min. 100 workers) atau Laravel Octane (Swoole/RoadRunner).<br/>"
        "3. <b>Penyesuaian Throttle di Lingkungan Ujian:</b> Tingkatkan ambang batas rate limiter pada rute ujian dari 30 req/min "
        "menjadi konfigurasi dinamis berdasarkan kapasitas sesi tryout (misal 500 req/min).",
        body_style
    ))
    
    # Section 6
    story.append(Paragraph("6. DAFTAR ARTIFAK DAN BUKTI PENGUJIAN", h1_style))
    artifacts_data = [
        [
            Paragraph("Jenis Artifak", table_header_style),
            Paragraph("Nama File / Lokasi", table_header_style),
            Paragraph("Deskripsi Isi", table_header_style)
        ],
        [
            Paragraph("Script k6 Skenario A", table_cell_bold),
            Paragraph("<code>tests/k6/scenarios/soal-response-time.js</code>", table_cell_style),
            Paragraph("Script pengujian beban soal bertahap hingga 500 VU dengan isolasi metrik & checks ketat.", table_cell_style)
        ],
        [
            Paragraph("Script k6 Skenario B", table_cell_bold),
            Paragraph("<code>tests/k6/scenarios/editor-analytics-dashboard.js</code>", table_cell_style),
            Paragraph("Script pengujian beban dashboard Editor (ringkasan stok & analitik penguasaan) hingga 50 VU.", table_cell_style)
        ],
        [
            Paragraph("Hasil Eksekusi JSON", table_cell_bold),
            Paragraph("<code>summary-skenario-a-soal.json</code><br/><code>summary-skenario-b-editor.json</code>", table_cell_style),
            Paragraph("Ekspor data ringkasan metrik lengkap (avg, min, med, p90, p95, max, rps, checks).", table_cell_style)
        ],
        [
            Paragraph("Log Terminal TXT", table_cell_bold),
            Paragraph("<code>output-skenario-a-soal.txt</code><br/><code>output-skenario-b-editor.txt</code>", table_cell_style),
            Paragraph("Log output mentah eksekusi konsol k6 dari tahap inisiasi hingga teardown.", table_cell_style)
        ],
        [
            Paragraph("Tangkapan Layar PNG", table_cell_bold),
            Paragraph("<code>screenshot-skenario-a.png</code><br/><code>screenshot-skenario-b.png</code>", table_cell_style),
            Paragraph("Bukti visual terminal eksekusi k6 resolusi tinggi dengan banner dan hasil check.", table_cell_style)
        ],
        [
            Paragraph("Laporan Resmi PDF & MD", table_cell_bold),
            Paragraph("<code>LAPORAN_LOAD_TESTING_EDVORA.pdf</code><br/><code>LAPORAN_LOAD_TESTING_EDVORA.md</code>", table_cell_style),
            Paragraph("Dokumen laporan resmi komprehensif untuk diserahkan kepada tim dan evaluator.", table_cell_style)
        ]
    ]
    t_art = Table(artifacts_data, colWidths=[120, 184, 200])
    t_art.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t_art)
    
    # Build document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Laporan PDF berhasil di-generate: {pdf_path}")

if __name__ == "__main__":
    generate_pdf()
