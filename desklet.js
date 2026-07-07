const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;

const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Cairo = imports.cairo;

class FollowingEyesDesklet extends Desklet.Desklet {

    constructor(metadata, deskletId) {
        super(metadata, deskletId);

        this.setHeader("Following Eyes");

        // -------------------------
        // Settings
        // -------------------------
        this.settings = new Settings.DeskletSettings(
            this,
            metadata.uuid,
            deskletId
        );

        this.settings.bind("eyeSize", "eyeSize", this._onSettingsChanged.bind(this));
        this.settings.bind("pupilSize", "pupilSize", this._onSettingsChanged.bind(this));
        this.settings.bind("irisSize", "irisSize", this._onSettingsChanged.bind(this));
        this.settings.bind("irisColour", "irisColour", this._onSettingsChanged.bind(this));
        this.settings.bind("eyeSpacing", "eyeSpacing", this._onSettingsChanged.bind(this));
        this.settings.bind("springStrength", "springStrength", this._onSettingsChanged.bind(this));
        this.settings.bind("damping", "damping", this._onSettingsChanged.bind(this));
        this.settings.bind("saccadeStrength", "saccadeStrength", this._onSettingsChanged.bind(this));
        this.settings.bind("enableBlink", "enableBlink", this._onSettingsChanged.bind(this));
        this.settings.bind("blinkInterval", "blinkInterval", this._onSettingsChanged.bind(this));
        this.settings.bind("preset", "preset", this._presetChanged.bind(this));
        this.settings.bind("animationFPS", "animationFPS", this._onSettingsChanged.bind(this));

        // -------------------------
        // State
        // -------------------------
        this._mouseX = 0;
        this._mouseY = 0;
        this._smoothX = 0;
        this._smoothY = 0;
        this._velX = 0;
        this._velY = 0;

        this._blink = 0;

        this._lastMouseX = 0;
        this._lastMouseY = 0;

        this._idle = false;
        this._idleTargetX = 0;
        this._idleTargetY = 0;

        this._idleTimer = 0;
        this._idleActionTimer = 0;

        this._idleX = 0;
        this._idleY = 0;

        this._idleVelX = 0;
        this._idleVelY = 0;

        this._thinking = false;
        this._thinkingUntil = 0;

        this._lastMouseMove = Date.now();

        this._frameId = 0;
        this._blinkTimeout = 0;
        this._blinkAnim = 0;

        // -------------------------
        // Canvas
        // -------------------------
        this.canvas = new St.DrawingArea();

        this.canvas.connect("repaint", (area) => {
            let cr = area.get_context();
            this._onDraw(area, cr);
            cr.$dispose();
        });

        this.actor.add_child(this.canvas);

        this._resize();
        this._startLoop();
        this._scheduleBlink();
        this._scheduleSaccade();

        this.canvas.set_size(this.width, this.height);
        this.actor.set_size(this.width, this.height);

        this.canvas.queue_repaint();
    }

    // -------------------------
    // Settings
    // -------------------------
    _onSettingsChanged() {

        if (this._blinkAnim) {
            this._safeRemove("_blinkAnim");
            this._blinkAnim = 0;
        }

        if (this._blinkTimeout) {
            this._safeRemove("_blinkTimeout");
            this._blinkTimeout = 0;
        }

        this._resize();
        this._startLoop();

        this._blink = 0;

        this.canvas.queue_repaint();
        this._scheduleBlink();

    }

    _presetChanged() {

        this._loadingPreset = true;

        this._applyPreset();

        this._loadingPreset = false;

        this._onSettingsChanged();
    }

    _resize() {

        const d = this.eyeSize;

        this.eyeRadius = d / 2;

        this.width = d * 4.0;
        this.height = d * 2.0;

        this.canvas.set_size(this.width, this.height);
        this.actor.set_size(this.width, this.height);
    }

    _resetToDefaults() {

        // Appearance
        this.eyeSize = 80;
        this.pupilSize = 0.22;
        this.eyeSpacing = 1.15;
        this.irisColour = "none";
        this.irisSize = 1.8;

        // Blink
        this.enableBlink = true;
        this.blinkInterval = 5;

        // Movement
        this.springStrength = 0.18;
        this.damping = 0.78;

        // Micro-saccades
        this.saccadeStrength = 6;

        // internal state reset
        this._blink = 0;
        this._velX = 0;
        this._velY = 0;

        // force UI refresh
        this._resize();
        this.canvas.queue_repaint();

        // restart blink cycle cleanly
        this._scheduleBlink();
    }

    _applyPreset() {

        switch (this.preset) {

        case "sleepy":
            this.springStrength = 0.10;
            this.damping = 0.90;
            this.blinkInterval = 3;
            this.pupilSize = 0.35;
            break;

        case "alert":
            this.springStrength = 0.28;
            this.damping = 0.70;
            this.blinkInterval = 8;
            this.saccadeStrength = 10;
            this.pupilSize = 0.20;
            break;

        case "paranoid":
            this.springStrength = 0.35;
            this.damping = 0.60;
            this.blinkInterval = 2;
            this.saccadeStrength = 14;
            this.pupilSize = 0.10;
            break;

        case "lazy_cat":
            this.springStrength = 0.05;
            this.damping = 0.60;
            this.blinkInterval = 10;
            this.pupilSize = 0.50;
            break;

        default: // normal
            this.springStrength = 0.18;
            this.damping = 0.78;
            this.blinkInterval = 5;
            this.saccadeStrength = 6;
            break;
        }
    }

    // -------------------------
    // Mouse loop
    // -------------------------
    _startLoop() {

        if (this._frameId) {
            GLib.source_remove(this._frameId);
            this._frameId = 0;
        }

        const interval = Math.max(1, Math.round(1000 / this.animationFPS));

        this._frameId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            interval,
            () => {

                let [x, y] = global.get_pointer();

                const moved =
                    Math.abs(x - this._lastMouseX) > 2 ||
                    Math.abs(y - this._lastMouseY) > 2;

                if (x !== this._mouseX || y !== this._mouseY)
                    this._lastMouseMove = Date.now();

                this._mouseX = x;
                this._mouseY = y;

                if (moved) {

                    this._lastMouseX = x;
                    this._lastMouseY = y;

                    if (this._idle)
                        this._leaveIdle();

                    this._restartIdleTimer();
                }

                const spring = this.springStrength;
                const damping = this.damping;

                if (this._thinking &&
                    Date.now() > this._thinkingUntil) {

                    this._thinking = false;

                    this._idleTargetX = 0;
                    this._idleTargetY = 0;
                }

                this._velX += (this._mouseX - this._smoothX) * spring;
                this._velY += (this._mouseY - this._smoothY) * spring;

                this._velX *= damping;
                this._velY *= damping;

                this._smoothX += this._velX;
                this._smoothY += this._velY;

                // Prevent tiny movements from repainting

                if (Math.abs(this._mouseX - this._smoothX) < 0.01)
                    this._smoothX = this._mouseX;

                if (Math.abs(this._mouseY - this._smoothY) < 0.01)
                    this._smoothY = this._mouseY;

                if (Math.abs(this._velX) < 0.01)
                    this._velX = 0;

                if (Math.abs(this._velY) < 0.01)
                    this._velY = 0;

                if (Date.now() - this._lastMouseMove > 4000) {

                    this._idleVelX +=
                        (this._idleTargetX - this._idleX) * 0.18;

                    this._idleVelY +=
                        (this._idleTargetY - this._idleY) * 0.18;

                    this._idleVelX *= 0.72;
                    this._idleVelY *= 0.72;

                    this._idleX += this._idleVelX;
                    this._idleY += this._idleVelY;

                    // Prevent tiny movements from repainting
                    if (Math.abs(this._velX) < 0.01)
                        this._velX = 0;

                    if (Math.abs(this._velY) < 0.01)
                        this._velY = 0;

                } else {

                    this._idleX *= 0.88;
                    this._idleY *= 0.88;

                    this._idleVelX = 0;
                    this._idleVelY = 0;
                }

                // Only repaint if something has changed
                const repaint =
                    this._blinkAnim ||
                    Math.abs(this._velX) > 0.05 ||
                    Math.abs(this._velY) > 0.05 ||
                    Math.abs(this._idleVelX) > 0.05 ||
                    Math.abs(this._idleVelY) > 0.05 ||
                    Math.abs(this._idleX) > 0.05 ||
                    Math.abs(this._idleY) > 0.05 ||
                    moved;

                if (repaint)
                    this.canvas.queue_repaint();

                return true;
            }
        );
    }

    _restartIdleTimer() {

        if (this._idleTimer)
            this._safeRemove("_idleTimer");

        this._idleTimer = Mainloop.timeout_add(
            3000,
            () => {

                this._idleTimer = 0;

                this._enterIdle();

                return false;
            }
        );
    }

    _enterIdle() {

        this._idle = true;

        this._nextIdleAction();
    }

    _leaveIdle() {

        this._idle = false;

        if (this._idleActionTimer)
            this._safeRemove("_idleActionTimer");

        this._idleTargetX = 0;
        this._idleTargetY = 0;
    }

    _nextIdleAction() {

        if (!this._idle)
            return;

        const choices = [

            [-40, 0],     // left
            [40, 0],      // right
            [0, -35],     // up
            [0, 25],      // down
            [0, 0]        // centre

        ];

        let choice =
            choices[Math.floor(Math.random() * choices.length)];

        this._idleTargetX = choice[0];
        this._idleTargetY = choice[1];

        if (Math.random() < 0.35)
            this._startBlink();

        this._idleActionTimer = Mainloop.timeout_add(
            1200 + Math.random() * 1800,
            () => {

                this._nextIdleAction();

                return false;
            }
        );
    }

    // -------------------------
    // Draw
    // -------------------------
    _onDraw(canvas, cr) {

        cr.save();
        cr.setOperator(Cairo.Operator.CLEAR);
        cr.paint();
        cr.restore();

        cr.save();
        cr.setOperator(Cairo.Operator.OVER);

        let blink = this._blink;

        const r = this.eyeRadius;

        const cx = this.width / 2;
        const cy = this.height / 2;

        const spacing = r * this.eyeSpacing;

        const left = cx - spacing;
        const right = cx + spacing;

        this._drawEye(cr, left, cy, r, blink);
        this._drawEye(cr, right, cy, r, blink);

        cr.restore();

        return true;
    }

    // -------------------------
    // Eye
    // -------------------------
    _drawEye(cr, cx, cy, r, blink) {

        cr.save();

        cr.arc(cx, cy, r, 0, Math.PI * 2);
        cr.clip();

        // White
        cr.setSourceRGB(1, 1, 1);
        cr.arc(cx, cy, r, 0, Math.PI * 2);
        cr.fill();

        // Pupil
        const pupilRadius = r * this.pupilSize * (1 - this._blink * 0.15);

        const irisRadius = Math.min(
            r * 0.80,
            pupilRadius * this.irisSize
        );

        let pupil = this._getPupil(cx, cy, r);

        let colour = this._getIrisColour();

        if (colour) {

            // Iris
            let gradient = new Cairo.RadialGradient(
                pupil.x,
                pupil.y,
                irisRadius * 0.20,
                pupil.x,
                pupil.y,
                irisRadius
            );

            gradient.addColorStopRGB(
                0,
                Math.min(colour[0] * 1.35, 1),
                Math.min(colour[1] * 1.35, 1),
                Math.min(colour[2] * 1.35, 1)
            );

            gradient.addColorStopRGB(
                0.55,
                colour[0],
                colour[1],
                colour[2]
            );

            gradient.addColorStopRGB(
                1,
                colour[0] * 0.45,
                colour[1] * 0.45,
                colour[2] * 0.45
            );

            cr.setSource(gradient);

            cr.arc(
                pupil.x,
                pupil.y,
                irisRadius,
                0,
                Math.PI * 2
            );

            cr.fill();

            // Limbal ring
            cr.setSourceRGB(
                colour[0] * 0.45,
                colour[1] * 0.45,
                colour[2] * 0.45
            );

            cr.setLineWidth(Math.max(2, irisRadius * 0.08));

            cr.setSourceRGBA(
                colour[0] * 0.35,
                colour[1] * 0.35,
                colour[2] * 0.35,
                0.75
            );

            cr.arc(
                pupil.x,
                pupil.y,
                irisRadius,
                0,
                Math.PI * 2
            );

            cr.stroke();
        }

        // Pupil
        cr.setSourceRGB(0,0,0);

        cr.arc(
            pupil.x,
            pupil.y,
            pupilRadius,
            0,
            Math.PI * 2
        );

        cr.fill();

        // Catchlight
        cr.setSourceRGBA(1,1,1,0.9);
        cr.arc(
            pupil.x - irisRadius * 0.28,
            pupil.y - irisRadius * 0.28,
            irisRadius * 0.12,
            0,
            Math.PI * 2
        );
        cr.fill();

        cr.setSourceRGBA(1,1,1,0.45);
        cr.arc(
            pupil.x + irisRadius * 0.15,
            pupil.y + irisRadius * 0.12,
            irisRadius * 0.05,
            0,
            Math.PI * 2
        );
        cr.fill();

        if (blink > 0)
            this._drawBlink(cr, cx, cy, r, blink);

        cr.restore();

        cr.setSourceRGB(0, 0, 0);
        cr.setLineWidth(r * 0.06);
        cr.arc(cx, cy, r, 0, Math.PI * 2);
        cr.stroke();
    }

    _getIrisColour() {

        switch (this.irisColour) {

            case "blue":
                return [0.25, 0.50, 0.90];

            case "green":
                return [0.20, 0.60, 0.25];

            case "grey":
                return [0.55, 0.55, 0.60];

            case "amber":
                return [0.78, 0.55, 0.10];

            case "brown":
                return [0.45, 0.28, 0.12];

            default:
                return null;
        }
    }

    // -------------------------
    // Blink (stable, no clip)
    // -------------------------
    _drawBlink(cr, cx, cy, r, blink) {

        cr.setSourceRGB(0.90, 0.90, 0.90);

        let upperEdge = cy - r + (2 * r * 0.90 * blink);
        let lowerEdge = cy + r - (2 * r * 0.10 * blink);

        if (upperEdge > lowerEdge)
            upperEdge = lowerEdge;

        // Upper eyelid
        cr.newPath();

        cr.moveTo(cx - r, cy - r);
        cr.lineTo(cx - r, upperEdge);

        cr.curveTo(
            cx - r * 0.35, upperEdge + r * 0.10,
            cx + r * 0.35, upperEdge + r * 0.10,
            cx + r, upperEdge
        );

        cr.lineTo(cx + r, cy - r);
        cr.closePath();
        cr.fill();

        // Lower eyelid
        cr.newPath();

        cr.moveTo(cx - r, cy + r);
        cr.lineTo(cx - r, lowerEdge);

        cr.curveTo(
            cx - r * 0.35, lowerEdge - r * 0.08,
            cx + r * 0.35, lowerEdge - r * 0.08,
            cx + r, lowerEdge
        );

        cr.lineTo(cx + r, cy + r);
        cr.closePath();
        cr.fill();
    }

    // -------------------------
    // Pupil movement
    // -------------------------
    _getPupil(cx, cy, r) {

        let [ax, ay] = this.actor.get_transformed_position();

        let eyeX = ax + cx;
        let eyeY = ay + cy;

        let dx;
        let dy;

        if (this._idle) {

            dx = this._idleTargetX;
            dy = this._idleTargetY;

        } else {

            dx = this._smoothX - eyeX;
            dy = this._smoothY - eyeY;

        }

        dx += this._idleX;
        dy += this._idleY;

        let dist = Math.sqrt(dx * dx + dy * dy);

        const pupilR = r * this.pupilSize;
        const max = r - pupilR - r * 0.1;

        if (dist > 0) {
            let scale = Math.min(max / dist, 1);
            dx *= scale;
            dy *= scale;
        }

        return {
            x: cx + dx,
            y: cy + dy
        };
    }

    _scheduleSaccade() {

        let delay = 1800 + Math.random() * 3500;

        this._saccadeTimer = Mainloop.timeout_add(delay, () => {

            if (Date.now() - this._lastMouseMove > 4000) {

                if (!this._thinking && Math.random() < 0.15) {

                    this._thinking = true;

                    this._thinkingUntil =
                        Date.now() + 1700 + Math.random() * 1000;

                    if (!this._blinkAnim)
                        this._startBlink();

                    this._thinkingTimer = Mainloop.timeout_add(120, () => {

                        this._idleTargetX =
                            (Math.random() < 0.5) ? -5 : 5;

                        this._idleTargetY = -4;

                        return false;
                    });

                } else if (!this._thinking) {

                    this._idleTargetX +=
                        (Math.random() - 0.5) * this.saccadeStrength;

                    this._idleTargetY +=
                        (Math.random() - 0.5) * this.saccadeStrength;

                }

                this._idleTargetX =
                    Math.max(-8,
                        Math.min(8, this._idleTargetX));

                this._idleTargetY =
                    Math.max(-5,
                        Math.min(5, this._idleTargetY));
            }

            this._scheduleSaccade();

            return false;
        });
    }

    // -------------------------
    // Blink scheduling
    // -------------------------
    _scheduleBlink() {

        if (this._blinkTimeout) {
            this._safeRemove("_blinkTimeout");
            this._blinkTimeout = 0;
        }

        if (!this.enableBlink)
            return;

        const delay =
            this.blinkInterval * 1000 +
            Math.random() * this.blinkInterval * 1000;

        this._blinkTimeout = Mainloop.timeout_add(delay, () => {
            this._blinkTimeout = 0;
            this._startBlink();
            return false;
        });
    }

    // -------------------------
    // Blink animation
    // -------------------------
    _startBlink() {

        if (this._blinkAnim)
            this._safeRemove("_blinkAnim");

        let frames = 20 + Math.floor(Math.random() * 8);
        let f = 0;

        this._blinkAnim = Mainloop.timeout_add(16, () => {

            f++;

            let t = f / frames;

            if (t < 0.45) {

                // Fast close
                this._blink = t / 0.45;

            } else if (t < 0.60) {

                // Brief hold
                this._blink = 1.0;

            } else {

                // Slower open
                this._blink = 1 - ((t - 0.60) / 0.40);
            }

            // Smooth easing
            this._blink =
                this._blink * this._blink *
                (3 - 2 * this._blink);

            this.canvas.queue_repaint();

            if (f >= frames) {

                this._blink = 0;
                this._blinkAnim = 0;

            if (Math.random() < 0.08) {

                this._doubleBlinkTimer = Mainloop.timeout_add(140, () => {
                    this._startBlink();
                    return false;
                });

            } else {

                this._scheduleBlink();

            }

                return false;
            }

            return true;
        });
    }

    _safeRemove(idName) {

        const id = this[idName];

        this[idName] = 0;

        if (id > 0)
            Mainloop.source_remove(id);
    }

    // -------------------------
    // Cleanup
    // -------------------------
    on_desklet_removed() {

        if (this._frameId)
            Mainloop.source_remove(this._frameId);

        this._safeRemove("_idleTimer");
        this._safeRemove("_idleActionTimer");

        this._safeRemove("_blinkTimeout");

        this._safeRemove("_blinkAnim");

        this._safeRemove("_saccadeTimer");

        this._safeRemove("_doubleBlinkTimer");

        this._safeRemove("_thinkingTimer");
    }
}

function main(metadata, deskletId) {
    return new FollowingEyesDesklet(metadata, deskletId);
}