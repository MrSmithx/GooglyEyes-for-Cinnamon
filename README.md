# 👀 Googly Eyes Desklet

A fun and lightweight **Cinnamon Desklet** that draws a pair of animated eyes which follow your mouse cursor around the desktop.

The eyes feature smooth spring-based movement, realistic blinking, idle behaviours, micro-saccades, configurable iris colours, and several personality presets.

---

## Features

- 👁️ Smooth mouse tracking with spring physics
- 😴 Automatic idle behaviour after inactivity
- 👀 Random eye movements (micro-saccades)
- 😉 Natural blinking with occasional double blinks
- 🎨 Optional coloured irises
- ⚙️ Fully configurable appearance and movement
- 🎭 Multiple personality presets
- 🚀 Adjustable animation frame rate for balancing smoothness and CPU usage
- 💻 Optimised repainting to reduce unnecessary CPU load

---

## Settings

### Appearance

- Eye Size
- Eye Spacing
- Pupil Size
- Iris Size
- Iris Colour

### Movement

- Spring Strength
- Damping
- Micro-saccade Strength

### Animation

- Enable Blinking
- Blink Interval
- Animation FPS

### Presets

Choose from several built-in personalities:

| Preset | Behaviour |
|---------|-----------|
| Normal | Balanced movement and blinking |
| Sleepy | Slow movement, larger pupils, frequent blinking |
| Alert | Fast tracking with quick reactions |
| Paranoid | Very fast eye movement with frequent blinks |
| Lazy Cat | Relaxed movement with large pupils |

---

## Behaviour

### Mouse Tracking

The pupils follow the mouse using a spring simulation rather than snapping directly to the cursor, creating smooth, natural-looking movement.

### Blinking

When enabled, the eyes blink at random intervals.

Features include:

- Smooth eyelid animation
- Variable blink timing
- Occasional double blinks

### Idle Mode

After several seconds without mouse movement the eyes become "alive" by:

- Looking left and right
- Looking up and down
- Returning to centre
- Blinking occasionally

### Thinking Behaviour

Occasionally while idle the eyes briefly glance upward before returning to normal movement.

---

## Performance

Recent versions include several optimisations designed to minimise CPU usage:

- Repaints occur only while something is changing
- Tiny movements are automatically snapped to rest
- Adjustable animation frame rate
- Efficient timer cleanup when the desklet is removed

For most systems an **Animation FPS of 30** provides smooth motion while reducing CPU usage compared to 60 FPS.

---

## Installation

1. Copy the desklet into your Cinnamon desklets directory.
2. Open **System Settings → Desklets**.
3. Enable **Googly Eyes**.
4. Add it to your desktop.
5. Customise the settings to your liking.

---

## Requirements

- Linux Mint Cinnamon
- Cinnamon Desktop
- JavaScript (GJS)
- Cairo

---

## Future Ideas

Possible future enhancements include:

- Additional eye styles
- Eyebrows
- Eyelashes
- Eyelid colour themes
- Sleep mode
- Multiple pairs of eyes
- Better GPU-friendly rendering
- Event-driven animation loop for even lower CPU usage

---

## License

Released under the MIT License.

---

Enjoy giving your desktop a little personality! 👀
