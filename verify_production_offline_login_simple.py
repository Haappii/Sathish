import re
import urllib.request

url = 'https://haappiibilling.in'
req = urllib.request.Request(url, headers={'User-Agent': 'curl/7.68.0'})
html = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', errors='ignore')
script_urls = sorted({urllib.request.urljoin(url, m.group(1)) for m in re.finditer(r'src="([^"]+)"', html) if m.group(1).endswith('.js')})
print('Found script URLs:')
for script_url in script_urls:
    print(script_url)
print()
keywords = ['rememberOfflineAuth', 'tryOfflineAuth', 'hb_offline_auth_v1', 'offline_login', 'offline_auth', 'offlineMode']
for script_url in script_urls:
    print('---', script_url, '---')
    try:
        js = urllib.request.urlopen(urllib.request.Request(script_url, headers={'User-Agent': 'curl/7.68.0'}), timeout=20).read().decode('utf-8', errors='ignore')
        for keyword in keywords:
            if keyword in js:
                print('FOUND:', keyword)
    except Exception as e:
        print('fetch error:', e)
