import urllib.request
import re
import base64
import os

print("Fetching Google Font CSS for Noto Kufi Arabic...")
css_url = 'https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;600;700&display=swap'
req = urllib.request.Request(css_url, headers={
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
})

css_text = urllib.request.urlopen(req).read().decode('utf-8')
woff2_urls = re.findall(r'url\((https://[^\)]+\.woff2)\)', css_text)

print(f"Found {len(woff2_urls)} WOFF2 font files.")

b64_fonts = []
for idx, font_url in enumerate(woff2_urls[:3]):
    print(f"Downloading subset {idx+1}: {font_url}")
    font_bytes = urllib.request.urlopen(font_url).read()
    b64_str = base64.b64encode(font_bytes).decode('ascii')
    b64_fonts.append(f"""@font-face {{
  font-family: 'Noto Kufi Arabic';
  font-style: normal;
  font-weight: 400 700;
  font-display: block;
  src: url("data:font/woff2;base64,{b64_str}") format("woff2");
}}""")

css_out = "\n\n".join(b64_fonts) + "\n"
os.makedirs('src', exist_ok=True)
with open('src/fontEmbedded.css', 'w', encoding='utf-8') as f:
    f.write(css_out)

print("SUCCESS: Base64 Arabic webfonts written to src/fontEmbedded.css!")
