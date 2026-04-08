#!/usr/bin/env python3
import re

# Read the HTML file
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Count total inline styles before
total_styles = len(re.findall(r'style="', content))
print(f'Found {total_styles} style attributes')

# Define replacements - these will be applied sequentially

# 1. Badge styles - pro feature badges
content = re.sub(
    r'<span\s+style="\s+display: inline-block;\s+margin-top: 0\.5rem;\s+font-size: 0\.72rem;\s+background: #fef3c7;\s+color: #92400e;\s+padding: 0\.15rem 0\.6rem;\s+border-radius: 99px;\s+font-weight: 700;\s+"\s*>⭐ Pro feature</span>',
    '<span class="badge-pro">⭐ Pro feature</span>',
    content
)

# 2. Section backgrounds
content = re.sub(
    r'<section id="how" style="background: var\(--surface\); padding: 7rem 0">',
    '<section id="how" class="how-section-background">',
    content
)

# 3. Inner div padding 
content = re.sub(
    r'<div class="land-section" style="padding-top: 0; padding-bottom: 0">',
    '<div class="land-section how-section-inner">',
    content
)

# 4. Feature card center containers (flex with text-align center)
content = re.sub(
    r'<div style="text-align: center; padding: 1\.5rem">',
    '<div class="feature-card-center">',
    content
)

# 5. HR divider style
content = re.sub(
    r'<hr style="border: none; border-top: 1px solid var\(--border\)" />',
    '<hr class="feature-divider" />',
    content
)

# 6. Feature list styling
content = re.sub(
    r'<ul\s+style="list-style-position: inside; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0\.6rem;">',
    '<ul class="feature-list">',
    content
)

# 7. Feature list items
content = re.sub(
    r'<li\s+style="text-align: center; margin: 0; font-size: 0\.82rem; display: flex; align-items: center; justify-content: center; gap: 0\.45rem;">',
    '<li>',
    content
)

# 8. Feature list icons
content = re.sub(
    r'<i\s+style="flex-shrink: 0; margin-top: 0\.1rem">',
    '<i>',
    content
)

# 9. Flex pricing button container
content = re.sub(
    r'<div style="width: 100%; justify-content: center; margin-top: 0\.5rem">',
    '<div class="pricing-tiers-flex">',
    content
)

# Write back
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

# Count total inline styles after
total_styles_after = len(re.findall(r'style="', content))
print(f'After replacements: {total_styles_after} style attributes remaining')
print(f'Removed approximately: {total_styles - total_styles_after} inline styles')
print('Inline style cleanup complete!')
