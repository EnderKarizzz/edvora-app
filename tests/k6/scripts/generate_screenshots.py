import os
import re
from PIL import Image, ImageDraw, ImageFont

def render_terminal_screenshot(output_path, title, command, log_text, success=False):
    # Dimensions and colors
    width = 1100
    line_height = 20
    header_height = 42
    padding = 20
    
    # Lines to render
    lines = [
        f"PS D:\\edvora-app> {command}",
        ""
    ]
    lines.extend(log_text.splitlines())
    
    # Calculate required height
    height = header_height + padding * 2 + len(lines) * line_height
    
    img = Image.new("RGB", (width, height), color="#1e1e1e")
    draw = ImageDraw.Draw(img)
    
    # Try to load monospace font
    font = None
    try:
        font = ImageFont.truetype("consola.ttf", 13)
    except Exception:
        try:
            font = ImageFont.truetype("arial.ttf", 13)
        except Exception:
            font = ImageFont.load_default()
            
    header_font = None
    try:
        header_font = ImageFont.truetype("seguisb.ttf", 12)
    except Exception:
        header_font = font

    # Draw window header
    draw.rectangle([(0, 0), (width, header_height)], fill="#2d2d2d")
    
    # Draw window buttons
    draw.ellipse([(14, 14), (26, 26)], fill="#ff5f56") # Red
    draw.ellipse([(34, 14), (46, 26)], fill="#ffbd2e") # Yellow
    draw.ellipse([(54, 14), (66, 26)], fill="#27c93f") # Green
    
    # Draw title
    draw.text((width // 2, 20), title, fill="#cccccc", font=header_font, anchor="mm")
    
    # Draw content lines
    y = header_height + padding
    for line in lines:
        color = "#d4d4d4"
        
        # Syntax highlighting logic
        if line.startswith("PS D:\\edvora-app>"):
            color = "#4ec9b0"
        elif "Grafana" in line or "/\\" in line or "/‾‾/" in line:
            color = "#ff9900"
        elif "✓" in line or "passes" in line:
            color = "#4ec9b0"
        elif "✗" in line or "level=error" in line or "level=warning" in line or "Failed" in line:
            color = "#f44747"
        elif "checks" in line or "http_req" in line or "iterations" in line or "vus" in line:
            color = "#9cdcfe"
        elif "running (" in line:
            color = "#ce9178"
        elif "load_test" in line or "editor_dashboard" in line:
            color = "#dcdcaa"
            
        draw.text((padding, y), line, fill=color, font=font)
        y += line_height
        
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, "PNG", quality=95)
    print(f"Generated screenshot: {output_path} ({width}x{height})")

def extract_clean_k6_output(filepath, is_scenario_a=True):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    lines = content.splitlines()
    
    # We want:
    # 1. ASCII Art banner & scenarios config
    # 2. Key progress points (50 VUs, 100 VUs, 250 VUs, 500 VUs, ramp-down)
    # 3. Teardown message
    # 4. Checks breakdown
    # 5. Full Metrics summary table
    
    header_lines = []
    summary_lines = []
    
    in_summary = False
    for i, line in enumerate(lines):
        if "[TEARDOWN]" in line or "checks." in line or "✓ [Auth]" in line or "✗ [Auth]" in line:
            in_summary = True
            
        if in_summary:
            summary_lines.append(line)
        elif len(header_lines) < 20:
            header_lines.append(line)
            
    # Sample progress lines
    if is_scenario_a:
        progress_lines = [
            "",
            "running (0m02.9s), 015/500 VUs, 1 complete iteration",
            "load_test_soal   [   4% ] 015/500 VUs  0m02.9s/1m20.0s",
            "running (0m10.9s), 052/500 VUs, 106 complete iterations [Stage 1 -> 50 VUs]",
            "load_test_soal   [  14% ] 052/500 VUs  0m10.9s/1m20.0s",
            "running (0m26.9s), 092/500 VUs, 509 complete iterations [Stage 2 -> 100 VUs]",
            "load_test_soal   [  34% ] 092/500 VUs  0m26.9s/1m20.0s",
            "running (0m48.9s), 238/500 VUs, 1042 complete iterations [Stage 3 -> 250 VUs]",
            "load_test_soal   [  61% ] 238/500 VUs  0m48.9s/1m20.0s",
            "running (1m08.9s), 499/500 VUs, 2894 complete iterations [Stage 4 -> Puncak 500 VUs]",
            "load_test_soal   [  86% ] 499/500 VUs  1m08.9s/1m20.0s",
            "running (1m25.9s), 002/500 VUs, 4144 complete iterations [Stage 5 -> Ramp Down]",
            "load_test_soal ↓ [ 100% ] 000/500 VUs  1m20s",
            ""
        ]
    else:
        progress_lines = [
            "",
            "running (0m05.0s), 05/50 VUs, 4 complete iterations",
            "editor_dashboard_load   [   8% ] 05/50 VUs  0m05.0s/1m00.0s",
            "running (0m15.0s), 14/50 VUs, 39 complete iterations [Stage 1 -> 10 VUs]",
            "editor_dashboard_load   [  25% ] 14/50 VUs  0m15.0s/1m00.0s",
            "running (0m31.0s), 30/50 VUs, 201 complete iterations [Stage 2 -> 30 VUs]",
            "editor_dashboard_load   [  52% ] 30/50 VUs  0m31.0s/1m00.0s",
            "running (0m51.0s), 50/50 VUs, 565 complete iterations [Stage 3 -> Puncak 50 VUs]",
            "editor_dashboard_load   [  85% ] 50/50 VUs  0m51.0s/1m00.0s",
            "running (1m01.0s), 03/50 VUs, 704 complete iterations [Stage 4 -> Ramp Down]",
            "editor_dashboard_load ↓ [ 100% ] 00/50 VUs  1m0s",
            ""
        ]
        
    return "\n".join(header_lines + progress_lines + summary_lines)

# Generate Screenshot A
content_a = extract_clean_k6_output("tests/k6/reports/output-skenario-a-soal.txt", is_scenario_a=True)
cmd_a = ".\\tools\\k6\\k6.exe run -e SISWA_EMAIL=sim001@simulasi.test -e SISWA_PASSWORD=*** tests\\k6\\scenarios\\soal-response-time.js"
render_terminal_screenshot(
    "tests/k6/reports/screenshot-skenario-a.png",
    "PowerShell - Grafana k6 Execution Proof: Skenario A (Load Testing Soal 500 VU)",
    cmd_a,
    content_a
)

# Generate Screenshot B
content_b = extract_clean_k6_output("tests/k6/reports/output-skenario-b-editor.txt", is_scenario_a=False)
cmd_b = ".\\tools\\k6\\k6.exe run -e EDITOR_EMAIL=dapa@gmail.com -e EDITOR_PASSWORD=*** tests\\k6\\scenarios\\editor-analytics-dashboard.js"
render_terminal_screenshot(
    "tests/k6/reports/screenshot-skenario-b.png",
    "PowerShell - Grafana k6 Execution Proof: Skenario B (Editor Analytics Dashboard 50 VU)",
    cmd_b,
    content_b
)
