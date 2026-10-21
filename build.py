"""Builds the single-file app: python3 build.py  ->  Personal-Lab-Notebook.html
Joins src/app.html (the interface), src/shim.js (browser storage, no server) and vendor/jspdf (PDF export)."""
import pathlib
d = pathlib.Path(__file__).parent
app = (d/'src/app.html').read_text(); shim = (d/'src/shim.js').read_text(); js = (d/'vendor/jspdf.umd.min.js').read_text()
tag = '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>'; assert app.count(tag) == 1
app = app.replace(tag, '<script>' + js.replace('</script>', '<\\/script>') + '</script>')
old = "const blobUrl = id => '/_blob/' + id;"; assert app.count(old) == 1
app = app.replace(old, "const blobUrl = id => (window.__blobUrl ? window.__blobUrl(id) : '/_blob/' + id);")
head = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Personal Lab Notebook</title><script>' + shim + '</script></head><body style="margin:0">'
(d/'Personal-Lab-Notebook.html').write_text(head + app + '</body></html>')
print('Built Personal-Lab-Notebook.html')
