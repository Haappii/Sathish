import re
import urllib.request

url = 'https://haappiibilling.in'
req = urllib.request.Request(url, headers={'User-Agent': 'curl/7.68.0'})
html = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', errors='ignore')
scripts = sorted({m.group(1) for m in re.finditer(r'src="([^"]+)"', html)})
print('Scripts:')
print('\n'.join(scripts))
print()
pattern = re.compile(r'offline|rememberOfflineAuth|tryOfflineAuth|hb_offline_auth_v1|offline_login')
for s in scripts:
    if s.endswith('.js'):
        print('---', s, '---')
        js_url = urllib.request.urljoin(url, s)
        try:
            js = urllib.request.urlopen(urllib.request.Request(js_url, headers={'User-Agent': 'curl/7.68.0'}), timeout=20).read().decode('utf-8', errors='ignore')
            found = False
            for i, line in enumerate(js.splitlines(), 1):
                if pattern.search(line):
                    print(f'{i}: {line.strip()}')
                    found = True
                    if i >= 200:
                        break
            if not found:
                print('<no matches>')
        except Exception as e:
            print('Failed to fetch', js_url, e)
