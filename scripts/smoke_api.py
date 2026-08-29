import urllib.request
import json

req = urllib.request.Request('http://localhost:8000/api/simulate', method='POST')
req.add_header('Content-Type', 'application/json')
data = json.dumps({"steps": 5, "seed": 42}).encode('utf-8')

try:
    response = urllib.request.urlopen(req, data=data)
    print(response.status)
    print(len(response.read()))
except Exception as e:
    print(e)
