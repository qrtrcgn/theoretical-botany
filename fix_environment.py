with open("flora/physics/environment.py", "r") as f:
    content = f.read()

# Start in spring! (Day 90)
content = content.replace("days = ctx.time * ctx.config.environment.days_per_cycle", "days = ctx.time * ctx.config.environment.days_per_cycle + 90.0")

# Protect root from frost
content = content.replace("kill_mask_herb = ((types == int(APEX)) | (types == int(FLORAL_AXIS))) & (woodiness < 0.2)", "kill_mask_herb = ((types == int(APEX)) | (types == int(FLORAL_AXIS))) & (woodiness < 0.2) & (state.depth[live] > 0)")

with open("flora/physics/environment.py", "w") as f:
    f.write(content)
print("Environment patched.")
