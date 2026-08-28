with open("viewers/matplotlib_viewer.py", "r") as f:
    content = f.read()

content = content.replace('alive = snap["alive"]\n        ', '')
content = content.replace('if not alive[i]:\n                continue', 'pass')

with open("viewers/matplotlib_viewer.py", "w") as f:
    f.write(content)
print("Viewer patched again.")
