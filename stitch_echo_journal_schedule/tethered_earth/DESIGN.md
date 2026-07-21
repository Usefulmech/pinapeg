---
name: Tethered Earth
colors:
  surface: '#fdf8f6'
  surface-dim: '#ddd9d7'
  surface-bright: '#fdf8f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7f3f1'
  surface-container: '#f1edeb'
  surface-container-high: '#ece7e5'
  surface-container-highest: '#e6e2e0'
  on-surface: '#1c1b1a'
  on-surface-variant: '#4c4540'
  inverse-surface: '#31302f'
  inverse-on-surface: '#f4f0ee'
  outline: '#7e766f'
  outline-variant: '#cfc5bd'
  surface-tint: '#645d58'
  primary: '#332e29'
  on-primary: '#ffffff'
  primary-container: '#4a443f'
  on-primary-container: '#bab1ab'
  inverse-primary: '#cec5be'
  secondary: '#5e5e5b'
  on-secondary: '#ffffff'
  secondary-container: '#e1dfdb'
  on-secondary-container: '#63635f'
  tertiary: '#302f2b'
  on-tertiary: '#ffffff'
  tertiary-container: '#474541'
  on-tertiary-container: '#b6b3ad'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ebe1da'
  primary-fixed-dim: '#cec5be'
  on-primary-fixed: '#1f1b17'
  on-primary-fixed-variant: '#4c4641'
  secondary-fixed: '#e4e2dd'
  secondary-fixed-dim: '#c8c6c2'
  on-secondary-fixed: '#1b1c19'
  on-secondary-fixed-variant: '#474744'
  tertiary-fixed: '#e6e2dc'
  tertiary-fixed-dim: '#cac6c0'
  on-tertiary-fixed: '#1c1c18'
  on-tertiary-fixed-variant: '#484742'
  background: '#fdf8f6'
  on-background: '#1c1b1a'
  surface-variant: '#e6e2e0'
typography:
  display-lg:
    fontFamily: Libre Caslon Text
    fontSize: 64px
    fontWeight: '400'
    lineHeight: 72px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Libre Caslon Text
    fontSize: 40px
    fontWeight: '400'
    lineHeight: 48px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Libre Caslon Text
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 40px
  headline-sm:
    fontFamily: Libre Caslon Text
    fontSize: 24px
    fontWeight: '400'
    lineHeight: 32px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.03em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 20px
  max-width: 1280px
---

## Brand & Style

This design system is built for high-end editorial platforms, luxury lifestyle brands, and architectural portfolios. It emphasizes a "Quiet Luxury" aesthetic, moving away from high-energy digital trends toward something permanent, tactile, and grounded.

The style is a blend of **Minimalism** and **Tactile Sophistication**. It prioritizes extreme legibility, generous whitespace, and a restrained color palette to evoke a sense of calm and intellectual clarity. The interface should feel like a physical object—high-quality paper stock or a finely crafted workspace—rather than a flickering screen. 

The emotional response is one of composure and trust. By using a muted, desaturated palette and classic typography, the design system removes cognitive load, allowing content to take center stage with quiet authority.

## Colors

The palette is centered around a sophisticated, low-saturation earth tone that anchors the experience.

- **Primary (Muted Espresso):** A deeply desaturated, warm brown used for key accents, primary actions, and structural headers. It provides warmth without the intensity of a traditional "color."
- **Secondary (Cream Base):** A soft, off-white surface color that reduces eye strain and provides a premium, paper-like feel compared to pure white.
- **Tertiary (Soft Grey):** A warm-leaning taupe/grey used for subtle borders, secondary backgrounds, and disabled states.
- **Neutral (Charcoal):** Used for primary body text to ensure high legibility while maintaining the softness of the overall palette.

## Typography

This design system employs a high-contrast typographic pairing to establish clear hierarchy and character. 

**Libre Caslon Text** is used for display and headline roles. Its literary heritage lends an air of authority and timelessness. On mobile devices, display sizes are scaled down aggressively to maintain the "framed" feel of the content without causing excessive line wrapping.

**Hanken Grotesk** serves as the functional workhorse for body text and labels. It is a sharp, contemporary sans-serif that balances the traditionalism of the serif headlines. Body text should maintain generous line heights (1.5x - 1.6x) to facilitate long-form reading. Labels are set with slight tracking (letter-spacing) to ensure clarity at small sizes.

## Layout & Spacing

The layout philosophy follows a **Fixed Grid** model on desktop to mimic the structured columns of a premium magazine, transitioning to a fluid model on smaller devices.

- **Desktop:** A 12-column grid with a 1280px max-width. Margins are intentionally wide (64px) to create a "gallery" effect, pushing focus toward the center.
- **Tablet:** 8-column grid with 32px margins.
- **Mobile:** 4-column grid with 20px margins. 

Spacing follows a 4px baseline, but internal component padding should favor 8px increments (e.g., 16px, 24px, 32px) to maintain a sense of openness. Vertical rhythm is critical; use double the spacing between distinct sections compared to internal section elements.

## Elevation & Depth

To maintain the grounded, tactile aesthetic, this design system avoids heavy drop shadows and high-gloss effects. Instead, it utilizes **Tonal Layers** and **Low-Contrast Outlines**.

Depth is communicated through:
1.  **Surface Shifts:** Moving from the secondary color (Cream) to a slightly lighter or darker tertiary tint to indicate a change in container level.
2.  **Hairline Borders:** 1px borders in the tertiary color are preferred over shadows for defining card boundaries and input fields.
3.  **Subtle Insets:** For active states (like pressed buttons), use a very slight inner shadow or a color shift to the primary muted espresso to simulate a physical press.

## Shapes

The shape language is **Soft** and restrained. While sharp corners feel too aggressive for this palette, excessive rounding (pills) would feel too informal or "techy."

A 0.25rem (4px) base radius is applied to buttons, input fields, and small UI elements. Larger containers like cards may use the `rounded-lg` (8px) setting to provide a gentle structural frame. This minimal rounding retains a grid-aligned, architectural feel while softening the overall impact of the UI.

## Components

- **Buttons:** Primary buttons use the muted espresso background with cream text. There are no gradients. Secondary buttons use a hairline border of the primary color with a transparent background.
- **Input Fields:** Use a subtle cream background slightly darker than the main surface, with a 1px taupe border that darkens to muted espresso on focus. 
- **Cards:** Cards should be flat, defined by a 1px tertiary border. Avoid shadows unless used to indicate a "lift" on hover, in which case use a very diffused, low-opacity charcoal shadow.
- **Lists:** Use generous vertical padding (16px+) and subtle dividers. Avoid icons unless they are essential for navigation.
- **Chips/Tags:** Small, rectangular shapes with 4px radius. Use the tertiary color for the background with charcoal text for a low-key, archival look.
- **Navigation:** Top-level navigation should be minimalist, utilizing the label-md typography with wide letter spacing and no background containers.