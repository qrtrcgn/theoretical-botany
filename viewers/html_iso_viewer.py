import json
import numpy as np
from pathlib import Path
from flora.core.config import NodeType

def export_html(npz_path: str, out_html: str):
    data = np.load(npz_path)
    n = data['n'].item()
    pos = data['position'][:n]
    types = data['node_type'][:n]
    parent = data['parent'][:n]
    radii = data['radius'][:n]
    woodiness = data['woodiness'][:n] if 'woodiness' in data else np.zeros(n)
    
    # We need to construct directions and lengths for the isometric renderer
    # In python, nodes have positions. We can just export them as 'stem', 'leaf', 'flower'
    # with a start and end pos, or just as segments.
    
    nodes_json = []
    
    for i in range(1, n):
        p_idx = parent[i]
        if p_idx < 0:
            continue
            
        p1 = pos[p_idx]
        p2 = pos[i]
        
        dx = float(p2[0] - p1[0])
        dy = float(p2[1] - p1[1])
        dz = float(p2[2] - p1[2])
        dist = float(np.linalg.norm([dx, dy, dz]))
        
        if dist < 1e-5:
            # Maybe it's a flower or leaf without length?
            dir_x, dir_y, dir_z = 0.0, 1.0, 0.0
        else:
            dir_x, dir_y, dir_z = dx/dist, dy/dist, dz/dist
            
        ntype = 'stem'
        if types[i] == NodeType.FLOWER:
            ntype = 'flower'
        elif types[i] == NodeType.LEAF:
            ntype = 'leaf'
            
        nodes_json.append({
            'id': int(i),
            'parentId': int(p_idx),
            'type': ntype,
            'pos': {'x': float(p1[0]*100), 'y': float(p1[1]*100), 'z': float(p1[2]*100)},
            'dir': {'x': dir_x, 'y': dir_y, 'z': dir_z},
            'currentLength': dist * 100,
            'depth': 0, # approximation
            'age': float(woodiness[i] * 120) if ntype == 'stem' else 0,
            'colR': 0, 'colG': 0, 'colB': 0
        })

    # Read the offline HTML template
    html_template = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Flora Engine - Python Export</title>
<style>
  body { margin: 0; background: #0f172a; color: white; overflow: hidden; }
  canvas { display: block; width: 100vw; height: 100vh; cursor: crosshair; }
  #ui { position: absolute; top: 20px; left: 20px; background: rgba(15, 23, 42, 0.85); padding: 20px; border-radius: 8px; font-family: monospace; }
</style>
</head>
<body>
<canvas id="iso-canvas"></canvas>
<div id="ui">
  <h2>Flora Engine (Python 2.5D Export)</h2>
  <div id="status"></div>
</div>
<script>
  const plantNodes = JSON_DATA_HERE;
  
  const canvas = document.getElementById('iso-canvas');
  const ctx = canvas.getContext('2d');
  let width, height, scale = 2.0, offsetX = 0, offsetY = 0;
  
  function toIso(x, y, z) {
      const isoX = (x - y) * 0.866025; 
      const isoY = (x + y) * 0.5 - z;
      return { x: offsetX + isoX * scale, y: offsetY + isoY * scale };
  }

  function renderCanvas() {
      if (plantNodes.length > 0) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          plantNodes.forEach(n => {
              const p = toIso(n.pos.x, n.pos.y, n.pos.z);
              minX = Math.min(minX, p.x - offsetX); maxX = Math.max(maxX, p.x - offsetX);
              minY = Math.min(minY, p.y - offsetY); maxY = Math.max(maxY, p.y - offsetY);
          });
          offsetX = width/2 - (minX + maxX)/2;
          offsetY = height/2 - (minY + maxY)/2;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1; ctx.beginPath();
      for(let i=-20; i<=20; i+=2) {
          const p1 = toIso(i*40, -800, 0); const p2 = toIso(i*40, 800, 0);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          const p3 = toIso(-800, i*40, 0); const p4 = toIso(800, i*40, 0);
          ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
      }
      ctx.stroke();

      plantNodes.sort((a,b) => (b.pos.x + b.pos.y) - (a.pos.x + a.pos.y));

      plantNodes.forEach(n => {
          const p1 = toIso(n.pos.x, n.pos.y, n.pos.z);
          if (n.type === 'stem') {
              const endX = n.pos.x + n.dir.x * n.currentLength; 
              const endY = n.pos.y + n.dir.y * n.currentLength; 
              const endZ = n.pos.z + n.dir.z * n.currentLength;
              const p2 = toIso(endX, endY, endZ);
              const wood = Math.min(1.0, (n.age||0)/120);
              const r = 45*(1-wood) + 120*wood; const g = 140*(1-wood) + 80*wood; const b = 70*(1-wood) + 40*wood;
              ctx.strokeStyle = 'rgb('+r+','+g+','+b+')'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
          } else if (n.type === 'flower') {
              ctx.fillStyle = '#ec4899';
              ctx.beginPath(); ctx.arc(p1.x, p1.y, 6, 0, Math.PI*2); ctx.fill();
          } else if (n.type === 'leaf') {
              ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
              ctx.beginPath(); ctx.arc(p1.x, p1.y, 4, 0, Math.PI*2); ctx.fill();
          }
      });
      document.getElementById('status').innerText = plantNodes.length + " Segmente gerendert.";
  }

  function resize() {
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = width; canvas.height = height;
      offsetX = width / 2; offsetY = height - 100;
      renderCanvas();
  }
  window.addEventListener('resize', resize);
  
  let isDragging = false; let lastX, lastY;
  canvas.addEventListener('mousedown', e => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mousemove', e => {
      if(!isDragging) return;
      offsetX += e.clientX - lastX; offsetY += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      ctx.clearRect(0,0,width,height);
      plantNodes.forEach(n => {
          const p1 = toIso(n.pos.x, n.pos.y, n.pos.z);
          if (n.type === 'stem') {
              const p2 = toIso(n.pos.x + n.dir.x * n.currentLength, n.pos.y + n.dir.y * n.currentLength, n.pos.z + n.dir.z * n.currentLength);
              const wood = Math.min(1.0, (n.age||0)/120);
              ctx.strokeStyle = 'rgb('+(45*(1-wood)+120*wood)+','+(140*(1-wood)+80*wood)+','+(70*(1-wood)+40*wood)+')'; 
              ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
          } else {
              ctx.fillStyle = n.type==='flower' ? '#ec4899' : '#22c55e';
              ctx.beginPath(); ctx.arc(p1.x, p1.y, n.type==='flower'?6:4, 0, Math.PI*2); ctx.fill();
          }
      });
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); scale *= e.deltaY > 0 ? 0.9 : 1.1; resize(); });
  
  resize();
</script>
</body>
</html>"""

    final_html = html_template.replace("JSON_DATA_HERE", json.dumps(nodes_json))
    with open(out_html, 'w') as f:
        f.write(final_html)
    print(f"Exported 2.5D HTML viewer to {out_html}")

if __name__ == '__main__':
    export_html('plant_snapshot.npz', 'python_plant_viewer.html')

