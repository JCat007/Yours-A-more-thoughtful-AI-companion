# Skill China / World mode — `SKILL.md` examples

Examples of declaring China vs World behavior in skill frontmatter.

## Weather

```yaml
---
name: weather
description: Query weather for a location.
modes:
  china:
    engine: Open-Meteo API
    note: "Free, no API key, China-accessible"
  world:
    engine: Open-Meteo + wttr.in fallback
    note: "Open-Meteo global; wttr.in may timeout in China"
---
```

## Global-only skill

```yaml
---
name: calculator
description: Math calculations.
global: true
---
```
