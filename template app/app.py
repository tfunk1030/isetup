"""
iRace Telemetry Dashboard — Flask Web Application
Drag & drop IBT files for instant GTP engineering analysis.
"""

import os
import json
import numpy as np
from flask import Flask, render_template, request, jsonify
from ibt_parser import IBTFile
from analyzer import analyze


class NumpyEncoder(json.JSONEncoder):
    """Handle numpy types in JSON serialization."""
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, (np.bool_,)):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


app = Flask(__name__)
app.json.encoder = NumpyEncoder  # type: ignore
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200 MB max upload


@app.route('/')
def index():
    return render_template('dashboard.html')


@app.route('/api/analyze', methods=['POST'])
def analyze_ibt():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    f = request.files['file']
    if not f.filename.lower().endswith('.ibt'):
        return jsonify({'error': 'File must be .ibt format'}), 400

    try:
        raw = f.read()
        ibt = IBTFile(raw, filename=f.filename)
        result = analyze(ibt)
        return app.response_class(
            json.dumps(result, cls=NumpyEncoder),
            mimetype='application/json',
        )
    except Exception as e:
        return jsonify({'error': f'Parse error: {str(e)}'}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"\n  iRace Telemetry Dashboard")
    print(f"  Open http://localhost:{port} in your browser\n")
    app.run(debug=False, port=port, use_reloader=False)
