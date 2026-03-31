import os, json, base64, uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify, abort, Response

app = Flask(__name__)

DRAWINGS_DIR = os.path.join(os.path.dirname(__file__), 'drawings')
META_FILE    = os.path.join(DRAWINGS_DIR, 'meta.json')
os.makedirs(DRAWINGS_DIR, exist_ok=True)

def load_meta():
    if not os.path.exists(META_FILE): return []
    with open(META_FILE) as f: return json.load(f)

def save_meta(m):
    with open(META_FILE, 'w') as f: json.dump(m, f, indent=2)

@app.route('/')
def gallery():
    d = load_meta(); d.sort(key=lambda x: x['created'], reverse=True)
    return render_template('gallery.html', drawings=d)

@app.route('/draw')
def new_drawing():
    return render_template('editor.html', drawing=None)

@app.route('/draw/<did>')
def edit_drawing(did):
    d = next((x for x in load_meta() if x['id'] == did), None)
    return render_template('editor.html', drawing=d) if d else abort(404)

@app.route('/api/drawings', methods=['POST'])
def api_save():
    data = request.json
    meta = load_meta()
    did  = data.get('id')
    fields = {
        'title':        (data.get('title') or 'Sem título').strip(),
        'strokes':      data.get('strokes', []),
        'width':        data.get('width', 480),
        'height':       data.get('height', 360),
        'bg':           data.get('bg', '#ffffff'),
        'transparentBg':data.get('transparentBg', False),
        'borderRect':   data.get('borderRect', None),
        'borderColor':  data.get('borderColor', '#cc1a1a'),
        'borderSize':   data.get('borderSize', 4),
        'updated':      datetime.utcnow().isoformat(),
    }
    if data.get('gif'): fields['gif'] = data['gif']

    if did:
        e = next((x for x in meta if x['id'] == did), None)
        if not e: abort(404)
        e.update(fields); save_meta(meta); return jsonify(e)

    fields.update({'id': str(uuid.uuid4())[:8], 'gif': data.get('gif',''),
                   'created': datetime.utcnow().isoformat()})
    meta.append(fields); save_meta(meta)
    return jsonify(fields), 201

@app.route('/api/drawings/<did>', methods=['DELETE'])
def api_delete(did):
    save_meta([x for x in load_meta() if x['id'] != did])
    return jsonify({'ok': True})

@app.route('/api/drawings/<did>/export')
def api_export(did):
    d = next((x for x in load_meta() if x['id'] == did), None)
    if not d or not d.get('gif'): abort(404)
    raw = d['gif']; b = base64.b64decode(raw.split(',')[1] if ',' in raw else raw)
    return Response(b, mimetype='image/gif',
        headers={'Content-Disposition': f'attachment; filename="{d["title"]}.gif"'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
