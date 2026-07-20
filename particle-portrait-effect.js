/*
  ParticlePortraitEffect
  Reusable image-to-particles canvas effect.

  Basic use:
    <canvas id="particle-canvas"></canvas>
    <script type="module">
      import { ParticlePortraitEffect } from "./particle-portrait-effect.js";

      const effect = new ParticlePortraitEffect("#particle-canvas", {
        imageSrc: "./my-image.png",
        mode: "static", // static, center, off, fall
        palette: "photo" // photo, pearl, green, blue, warm, mix
      });

      document.querySelector("[data-mode='center']").onclick = () => effect.setMode("center");
      document.querySelector("[data-palette='warm']").onclick = () => effect.setPalette("warm");
    </script>

  Notes:
    - For local Chrome testing, run through a local server or pass a data URL.
    - For remote images, enable CORS on the image host and set crossOrigin.
*/

const DEFAULT_PALETTES = {
  pearl: [[243, 240, 232]],
  green: [[137, 214, 176], [72, 151, 112], [219, 231, 220]],
  blue: [[142, 199, 220], [69, 106, 120], [215, 233, 239]],
  warm: [[226, 112, 85], [190, 141, 47], [244, 231, 223]],
  mix: [[243, 240, 232], [137, 214, 176], [142, 199, 220], [226, 112, 85], [190, 141, 47]]
};

export class ParticlePortraitEffect {
  constructor(canvasOrSelector, options = {}) {
    this.canvas = typeof canvasOrSelector === "string"
      ? document.querySelector(canvasOrSelector)
      : canvasOrSelector;

    if (!this.canvas) {
      throw new Error("ParticlePortraitEffect: canvas not found.");
    }

    this.context = this.canvas.getContext("2d");
    this.options = {
      imageSrc: "",
      mode: "static",
      palette: "photo",
      particleLimit: 2200,
      sampleWidth: 210,
      sampleStep: 2,
      cursorRadius: 70,
      fit: .76,
      crossOrigin: null,
      palettes: DEFAULT_PALETTES,
      ...options
    };

    this.mode = this.options.mode;
    this.palette = this.options.palette;
    this.particles = [];
    this.targets = [];
    this.pointer = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, active: false };
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.scale = 1;
    this.time = 0;
    this.frame = 0;
    this.destroyed = false;

    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);

    this.resize();
    this.bindEvents();

    if (this.options.imageSrc) {
      this.setImage(this.options.imageSrc);
    } else {
      this.targets = this.createFallbackTargets(720);
      this.buildParticles(this.targets);
    }

    this.draw();
  }

  bindEvents() {
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("resize", this.resize);
  }

  destroy() {
    this.destroyed = true;
    window.cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("resize", this.resize);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || this.canvas.clientWidth || 640);
    this.height = Math.max(1, rect.height || this.canvas.clientHeight || 640);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scale = Math.min(
      this.width * this.options.fit / this.options.sampleWidth,
      this.height * this.options.fit / (this.options.sampleWidth * 1.12)
    );
  }

  setImage(imageSrc) {
    this.options.imageSrc = imageSrc;
    const image = new Image();
    if (this.options.crossOrigin) image.crossOrigin = this.options.crossOrigin;

    image.onload = () => {
      this.targets = this.sampleImage(image);
      if (!this.targets.length) this.targets = this.createFallbackTargets(720);
      this.buildParticles(this.targets);
    };

    image.onerror = () => {
      this.targets = this.createFallbackTargets(720);
      this.buildParticles(this.targets);
    };

    image.src = imageSrc;
  }

  setMode(mode) {
    this.mode = mode;

    this.particles.forEach((particle) => {
      if (mode === "static") {
        particle.x = particle.bx * this.scale;
        particle.y = particle.by * this.scale;
        particle.z = particle.bz;
        particle.vx = 0;
        particle.vy = 0;
        particle.vz = 0;
      }

      if (mode === "center") {
        particle.vx += (particle.bx * this.scale - particle.x) * .032;
        particle.vy += (particle.by * this.scale - particle.y) * .032;
        particle.vz += (particle.bz - particle.z) * .032;
      }

      if (mode === "off") {
        particle.vx += (Math.random() - .5) * 2.4;
        particle.vy += (Math.random() - .5) * 2.4;
        particle.vz += (Math.random() - .5) * 2.4;
      }

      if (mode === "fall") {
        particle.vy += 5 + Math.random() * 3;
        particle.vx += (Math.random() - .5) * 2;
      }
    });
  }

  setPalette(palette) {
    this.palette = palette;
    this.particles.forEach((particle) => {
      particle.vx += (Math.random() - .5) * 1.4;
      particle.vy += (Math.random() - .5) * 1.4;
      particle.vz += (Math.random() - .5) * 1.4;
    });
  }

  onPointerMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.px = this.pointer.x;
    this.pointer.py = this.pointer.y;
    this.pointer.x = event.clientX - rect.left - rect.width / 2;
    this.pointer.y = event.clientY - rect.top - rect.height / 2;
    this.pointer.vx = this.pointer.x - this.pointer.px;
    this.pointer.vy = this.pointer.y - this.pointer.py;
    this.pointer.active = true;
  }

  onPointerLeave() {
    this.pointer.active = false;
  }

  createFallbackTargets(total) {
    const targets = [];
    const offset = 2 / total;
    const increment = Math.PI * (3 - Math.sqrt(5));

    for (let index = 0; index < total; index += 1) {
      const y = index * offset - 1 + offset / 2;
      const radius = Math.sqrt(1 - y * y);
      const phi = index * increment;
      targets.push({
        tx: Math.cos(phi) * 180,
        ty: y * 180,
        tz: Math.sin(phi) * 120,
        color: this.fallbackColor(index),
        size: .8 + Math.random() * 1.6,
        depth: Math.sin(phi) * .5
      });
    }

    return targets;
  }

  buildParticles(targets) {
    this.particles.length = 0;

    targets.forEach((target, index) => {
      const angle = index * .618;
      const spread = Math.max(this.width, this.height) * (.28 + Math.random() * .32);
      const startStatic = this.mode === "static";

      this.particles.push({
        bx: target.tx,
        by: target.ty,
        bz: target.tz,
        x: startStatic ? target.tx * this.scale : Math.cos(angle) * spread,
        y: startStatic ? target.ty * this.scale : Math.sin(angle) * spread,
        z: startStatic ? target.tz : (Math.random() - .5) * 280,
        vx: 0,
        vy: 0,
        vz: 0,
        color: target.color,
        size: target.size,
        depth: target.depth
      });
    });
  }

  sampleImage(image) {
    const sampleWidth = this.options.sampleWidth;
    const sampleHeight = Math.round(sampleWidth * image.naturalHeight / image.naturalWidth);
    const offscreen = document.createElement("canvas");
    const offscreenContext = offscreen.getContext("2d", { willReadFrequently: true });
    const targets = [];
    offscreen.width = sampleWidth;
    offscreen.height = sampleHeight;
    offscreenContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);

    let pixels;
    try {
      pixels = offscreenContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
    } catch (error) {
      console.warn("ParticlePortraitEffect: image pixels could not be read. Use same-origin images, CORS, or a data URL.");
      return targets;
    }

    const centerX = sampleWidth / 2;
    const centerY = sampleHeight / 2;

    for (let y = 0; y < sampleHeight; y += this.options.sampleStep) {
      for (let x = 0; x < sampleWidth; x += this.options.sampleStep) {
        const index = (y * sampleWidth + x) * 4;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const alpha = pixels[index + 3];
        const brightness = (red + green + blue) / 3;
        const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
        const nx = x / sampleWidth;
        const ny = y / sampleHeight;
        const edgeFalloff = Math.hypot((x - centerX) / centerX, (y - centerY) / centerY);
        const isWhite = brightness > 246 && spread < 16;
        const isUsefulLine = brightness < 224 || spread > 18;
        const isSoftInterior = brightness < 250 && ny > .08 && ny < .98 && nx > .05 && nx < .95;
        const keepPixel = alpha > 30 && !isWhite && (isUsefulLine || isSoftInterior) && edgeFalloff < 1.3;

        if (keepPixel && targets.length < this.options.particleLimit) {
          const depth = (128 - brightness) / 128;
          targets.push({
            tx: x - centerX,
            ty: y - centerY - sampleHeight * .06,
            tz: depth * 72 + (Math.random() - .5) * 18,
            color: this.liftColor(red, green, blue, brightness, spread, ny),
            size: Math.max(1.1, Math.min(3.2, 2.65 - brightness / 230)),
            depth
          });
        }
      }
    }

    return targets;
  }

  liftColor(red, green, blue, brightness, spread, ny) {
    if (spread < 18) {
      if (brightness < 145) return [248, 244, 232];
      if (ny < .2) return [235, 197, 126];
      if (ny > .38) return [242, 203, 186];
      return [236, 226, 212];
    }

    const lift = brightness < 92 ? 86 - brightness * .42 : 24;
    const warmth = red > blue ? 10 : 0;

    return [
      Math.min(255, Math.round(red + lift + warmth)),
      Math.min(255, Math.round(green + lift * .92)),
      Math.min(255, Math.round(blue + lift * .86))
    ];
  }

  fallbackColor(index) {
    const palette = this.options.palettes[this.palette] || this.options.palettes.pearl;
    return palette[index % palette.length];
  }

  particleColor(particle, index) {
    if (this.palette === "photo") return particle.color;
    const palette = this.options.palettes[this.palette] || this.options.palettes.pearl;
    if (this.palette === "mix") return palette[index % palette.length];
    return palette[Math.floor(((particle.depth + 1) / 2) * palette.length) % palette.length];
  }

  draw() {
    if (this.destroyed) return;

    this.time += .012;
    this.context.clearRect(0, 0, this.width, this.height);

    if (!this.particles.length) {
      this.frame = window.requestAnimationFrame(this.draw);
      return;
    }

    let cx = 0;
    let cy = 0;
    let cz = 0;

    this.particles.forEach((particle) => {
      cx += particle.x;
      cy += particle.y;
      cz += particle.z;
    });

    cx /= this.particles.length;
    cy /= this.particles.length;
    cz /= this.particles.length;

    this.particles.forEach((particle) => {
      const targetX = particle.bx * this.scale;
      const targetY = particle.by * this.scale;
      const targetZ = particle.bz;
      const wave = Math.sin(this.time + particle.depth * 3.2 + particle.bx * .03) * .18;

      if (this.mode === "static") {
        particle.x += (targetX - particle.x) * .42;
        particle.y += (targetY - particle.y) * .42;
        particle.z += (targetZ - particle.z) * .42;
        particle.vx = 0;
        particle.vy = 0;
        particle.vz = 0;
      }

      if (this.mode === "center") {
        particle.vx += (targetX - particle.x) * .016 + (cx - particle.x) * .0016 + wave;
        particle.vy += (targetY - particle.y) * .016 + (cy - particle.y) * .0016;
        particle.vz += (targetZ - particle.z) * .016 + (cz - particle.z) * .0016;
      }

      if (this.mode === "off") {
        particle.vx += Math.sin(this.time * 1.7 + particle.by * .035 + particle.depth) * .055;
        particle.vy += Math.cos(this.time * 1.4 + particle.bx * .035) * .055;
        particle.vz += Math.sin(this.time * 1.2 + particle.depth * 4) * .05;
        if (Math.abs(particle.x) > this.width * .62) particle.vx += -Math.sign(particle.x) * .12;
        if (Math.abs(particle.y) > this.height * .62) particle.vy += -Math.sign(particle.y) * .12;
      }

      if (this.mode === "fall") {
        particle.vx += (targetX - particle.x) * .0008 + Math.sin(this.time + particle.depth * 5) * .018;
        particle.vy += .36;
        particle.vz += (targetZ - particle.z) * .0012;

        if (particle.y > this.height / 2 + 120) {
          particle.y = -this.height / 2 - Math.random() * 180;
          particle.x = targetX + (Math.random() - .5) * 70;
          particle.z = targetZ;
          particle.vy = 1.6 + Math.random() * 2.6;
          particle.vx = (Math.random() - .5) * 1.8;
        }
      }

      this.applyPointerForce(particle);

      const damping = this.mode === "static" ? 0 : this.mode === "center" ? .91 : this.mode === "off" ? .982 : .965;
      particle.vx *= damping;
      particle.vy *= this.mode === "fall" ? .992 : damping;
      particle.vz *= damping;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.z += particle.vz;
    });

    this.renderParticles();
    this.frame = window.requestAnimationFrame(this.draw);
  }

  applyPointerForce(particle) {
    if (!this.pointer.active || this.mode === "static") return;

    const perspective = 560 / (560 - particle.z);
    const screenX = particle.x * perspective;
    const screenY = particle.y * perspective;
    const dx = screenX - this.pointer.x;
    const dy = screenY - this.pointer.y;
    const distSq = dx * dx + dy * dy;
    const influence = this.options.cursorRadius * this.options.cursorRadius;

    if (distSq < influence) {
      const dist = Math.sqrt(distSq) || 1;
      const force = (1 - dist / this.options.cursorRadius) * 1.3;
      particle.vx += (dx / dist) * force + this.pointer.vx * .045;
      particle.vy += (dy / dist) * force + this.pointer.vy * .045;
      particle.vz += force * 4.2;
      particle.vx += -dy * .0032 * force;
      particle.vy += dx * .0032 * force;
    }
  }

  renderParticles() {
    this.particles
      .slice()
      .sort((a, b) => a.z - b.z)
      .forEach((particle, index) => {
        const perspective = 560 / (560 - particle.z);
        const x = this.width / 2 + particle.x * perspective;
        const y = this.height / 2 + particle.y * perspective;
        const depth = Math.max(0, Math.min(1, (particle.z + 90) / 180));
        const alpha = this.mode === "static" ? .68 + depth * .3 : .42 + depth * .5;
        const size = particle.size * perspective * (1 + depth * (this.mode === "static" ? .22 : .38));
        const [red, green, blue] = this.particleColor(particle, index);

        this.context.beginPath();
        this.context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        this.context.arc(x, y, size, 0, Math.PI * 2);
        this.context.fill();
      });
  }
}

if (typeof window !== "undefined") {
  window.ParticlePortraitEffect = ParticlePortraitEffect;
}
