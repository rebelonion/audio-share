import type {PondContext} from './pondCanvas';
import {DROP_COUNT, DROP_LIFETIME, RAIN_AMPLITUDE, RAIN_FREQUENCY, RAIN_SPEED, surfaceSlope, type Drop, type POND_PALETTE} from './pond';

const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() { uv = vec2(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5); gl_Position = vec4(position, 0.0, 1.0); }
`;
const FRAGMENT = `
precision highp float;
varying vec2 uv;
uniform vec2 resolution;
uniform float time;
uniform float shimmer;
uniform vec4 drops[${DROP_COUNT}];
const float speed = ${RAIN_SPEED};
const float frequency = ${RAIN_FREQUENCY.toFixed(1)};
const float amplitude = ${RAIN_AMPLITUDE};
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
        mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
    float scale = min(resolution.x, resolution.y);
    vec2 p = uv * resolution / scale;
    vec2 moon = vec2(0.65, 0.275) * resolution / scale;
    float moonRadius = sqrt(resolution.x * resolution.y) / scale * 0.059;
    float swellA = cos(p.x * 15.0 + p.y * 9.0 + time * 0.31);
    float swellB = cos(p.x * 29.0 - p.y * 17.0 - time * 0.23);
    vec2 normal = vec2(swellA * 0.0028 + swellB * 0.0012, swellA * 0.0017 - swellB * 0.0007);
    normal += vec2(sin(p.y * 104.0 + sin(p.x * 19.0) * 1.4 - time * 0.49) * 0.003
        + sin(p.y * 193.0 - p.x * 27.0 + time * 0.37) * 0.0015,
        sin(p.y * 81.0 + p.x * 13.0 - time * 0.36) * 0.002);
    vec2 rain = vec2(0.0);
    for (int i = 0; i < ${DROP_COUNT}; i++) {
        vec4 drop = drops[i];
        if (drop.w <= 0.0) continue;
        vec2 delta = (p - drop.xy) / vec2(1.0, 0.82);
        float width = 0.012 + drop.z * 0.006;
        float inner = max(0.0, drop.z * speed - width * 3.0);
        float outer = drop.z * speed + width * 3.0;
        float distanceSquared = dot(delta, delta);
        if (distanceSquared > outer * outer || distanceSquared < max(inner * inner, 0.00000001)) continue;
        float distance = sqrt(distanceSquared);
        float offset = distance - drop.z * speed;
        float phase = distance * frequency - drop.z * frequency * speed;
        float envelope = exp(-offset * offset / (width * width)) * drop.w;
        float slope = amplitude * envelope * (frequency * cos(phase) - 2.0 * offset / (width * width) * sin(phase));
        rain += slope * delta / distance / vec2(1.0, 0.82);
    }
    normal += rain;
    vec2 reflected = p + normal * 0.7;
    vec2 moonUV = (reflected - moon) / vec2(moonRadius, moonRadius * 0.88);
    float radius = length(moonUV);
    float disk = 1.0 - smoothstep(0.975, 1.025, radius);
    float albedo = 0.84;
    if (disk > 0.0) {
        albedo -= noise(moonUV * 3.5 + 9.0) * 0.16 + noise(moonUV * 8.0 + 17.0) * 0.055;
        albedo += noise(moonUV * 29.0) * 0.018;
    }
    float glow = exp(-length(p - moon) / (moonRadius * 2.2));
    vec2 light = normalize(moon - p + vec2(0.001));
    float facing = dot(rain, light);
    float crest = max(0.0, facing) * 2.6;
    float trough = max(0.0, -facing) * 2.0;
    float ringAlpha = (crest + trough) * (0.65 + glow * 2.1);
    vec3 ringColor = mix(vec3(0.035, 0.09, 0.105), vec3(0.54, 0.69, 0.70), crest / max(0.0001, crest + trough));
    float moonAlpha = disk * (0.85 + shimmer * 0.015);
    vec3 moonColor = vec3(0.97, 1.0, 0.89) * albedo;
    float haloAlpha = glow * 0.12;
    float alpha = moonAlpha + (1.0 - moonAlpha) * (ringAlpha + haloAlpha);
    vec3 color = (moonColor * moonAlpha + (1.0 - moonAlpha) * (ringColor * ringAlpha + vec3(0.39, 0.53, 0.53) * haloAlpha)) / max(alpha, 0.0001);
    gl_FragColor = vec4(color, min(alpha, 1.0));
}
`;

const COMPOSITE = `
precision mediump float;
varying vec2 uv;
uniform sampler2D belowSurface;
uniform sampler2D aboveSurface;
uniform sampler2D waterSurface;
uniform vec2 aspect;
uniform vec3 deepColor;
uniform vec3 edgeColor;
uniform vec3 waterColor;
void main() {
    vec2 q = (uv - vec2(0.58, 0.37)) * aspect;
    vec2 d = vec2(-0.08, 0.13) * aspect;
    float k = 0.73 * 0.73 - dot(d, d);
    float projection = dot(q, d);
    float depth = clamp((sqrt(projection * projection + k * dot(q, q)) - projection) / k, 0.0, 1.0);
    vec3 background = depth < 0.55 ? mix(waterColor, edgeColor, depth / 0.55)
        : mix(edgeColor, deepColor, (depth - 0.55) / 0.45);
    vec4 fish = texture2D(belowSurface, uv);
    vec3 underwater = fish.rgb + background * (1.0 - fish.a);
    vec4 foreground = texture2D(aboveSurface, uv);
    vec4 surface = texture2D(waterSurface, vec2(uv.x, 1.0 - uv.y));
    vec3 water = mix(underwater, surface.rgb, surface.a);
    vec3 color = foreground.rgb + water * (1.0 - foreground.a);
    float inner = min(aspect.x, aspect.y) * 0.24;
    float shade = clamp((length((uv - vec2(0.5, 0.45)) * aspect) - inner) / (0.76 - inner), 0.0, 1.0) * 0.6;
    gl_FragColor = vec4(mix(color, vec3(1.0, 9.0, 17.0) / 255.0, shade), 1.0);
}
`;

export function createWaterSurface(canvas: OffscreenCanvas) {
    const gl = canvas.getContext('webgl', {alpha: false, antialias: false, depth: false});
    if (!gl) return null;
    const shaders: WebGLShader[] = [];
    const programs: WebGLProgram[] = [];
    const textures: WebGLTexture[] = [];
    const buffer = gl.createBuffer();
    const framebuffer = gl.createFramebuffer();
    const dispose = () => {
        gl.deleteBuffer(buffer);
        gl.deleteFramebuffer(framebuffer);
        programs.forEach(program => gl.deleteProgram(program));
        shaders.forEach(shader => gl.deleteShader(shader));
        textures.forEach(texture => gl.deleteTexture(texture));
        canvas.width = canvas.height = 1;
        gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    if (!buffer || !framebuffer) { dispose(); return null; }
    for (const fragment of [FRAGMENT, COMPOSITE]) {
        const program = gl.createProgram();
        if (!program) { dispose(); return null; }
        programs.push(program);
        for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fragment]] as const) {
            const shader = gl.createShader(type);
            if (!shader) { dispose(); return null; }
            shaders.push(shader);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            gl.attachShader(program, shader);
        }
        gl.bindAttribLocation(program, 0, 'position');
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { dispose(); return null; }
    }
    const [waterProgram, compositeProgram] = programs;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uniforms = {
        resolution: gl.getUniformLocation(waterProgram, 'resolution'), time: gl.getUniformLocation(waterProgram, 'time'),
        shimmer: gl.getUniformLocation(waterProgram, 'shimmer'), drops: gl.getUniformLocation(waterProgram, 'drops[0]'),
    };
    const composition = {
        aspect: gl.getUniformLocation(compositeProgram, 'aspect'),
        deep: gl.getUniformLocation(compositeProgram, 'deepColor'),
        edge: gl.getUniformLocation(compositeProgram, 'edgeColor'),
        water: gl.getUniformLocation(compositeProgram, 'waterColor'),
    };
    gl.useProgram(compositeProgram);
    for (const [unit, name] of ['belowSurface', 'aboveSurface', 'waterSurface'].entries()) {
        const texture = gl.createTexture();
        if (!texture) { dispose(); return null; }
        textures.push(texture);
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(gl.getUniformLocation(compositeProgram, name), unit);
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const packed = new Float32Array(DROP_COUNT * 4);
    let waterWidth = 0;
    let waterHeight = 0;
    let framebufferFailed = false;
    return {
        dispose,
        available: () => !framebufferFailed && !gl.isContextLost(),
        draw(ctx: PondContext, width: number, height: number, time: number, drops: Drop[], shimmer: number, palette: typeof POND_PALETTE, drawForeground: () => void) {
            if (framebufferFailed || gl.isContextLost()) return null;
            const w = ctx.canvas.width;
            const h = ctx.canvas.height;
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            const ratio = Math.min(1, 1200 / width, 900 / height);
            const ww = Math.max(1, Math.round(width * ratio));
            const wh = Math.max(1, Math.round(height * ratio));
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            if (waterWidth !== ww || waterHeight !== wh) {
                gl.activeTexture(gl.TEXTURE2);
                gl.bindTexture(gl.TEXTURE_2D, textures[2]);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ww, wh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[2], 0);
                if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
                    framebufferFailed = true;
                    return null;
                }
                waterWidth = ww;
                waterHeight = wh;
            }
            gl.useProgram(waterProgram);
            gl.viewport(0, 0, ww, wh);
            gl.uniform2f(uniforms.resolution, width, height);
            gl.uniform1f(uniforms.time, time);
            gl.uniform1f(uniforms.shimmer, shimmer);
            packed.fill(0);
            const scale = Math.min(width, height);
            drops.forEach((drop, i) => {
                packed[i * 4] = drop.x / scale;
                packed[i * 4 + 1] = drop.y / scale;
                packed[i * 4 + 2] = drop.age;
                packed[i * 4 + 3] = drop.onPad < 0 ? drop.strength * Math.exp(-drop.age * 0.9)
                    * Math.min(1, drop.age / 0.07) * Math.min(1, (DROP_LIFETIME - drop.age) / 0.6) : 0;
            });
            gl.uniform4fv(uniforms.drops, packed);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            // Composite on the GPU instead of reading water pixels back into the 2D canvas.
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, textures[0]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ctx.canvas);
            ctx.clearRect(0, 0, width, height);
            drawForeground();
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, textures[1]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ctx.canvas);
            gl.useProgram(compositeProgram);
            const extent = Math.max(width, height);
            gl.uniform2f(composition.aspect, width / extent, height / extent);
            for (const key of ['deep', 'edge', 'water'] as const) {
                const color = palette[key];
                const channels = color.startsWith('#') ? [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16))
                    : color.match(/[\d.]+/g)!.map(Number);
                gl.uniform3f(composition[key], channels[0] / 255, channels[1] / 255, channels[2] / 255);
            }
            gl.viewport(0, 0, w, h);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            return canvas;
        },
    };
}

export function drawWaterFallback(ctx: PondContext, width: number, height: number, time: number, drops: Drop[]) {
    const scale = Math.min(width, height);
    const radius = Math.sqrt(width * height) * 0.059;
    const x = width * 0.65;
    const y = height * 0.275;
    ctx.save();
    const glow = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 4);
    glow.addColorStop(0, 'rgba(159, 187, 177, 0.15)');
    glow.addColorStop(1, 'rgba(159, 187, 177, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius * 4, y - radius * 4, radius * 8, radius * 8);
    ctx.fillStyle = '#b4c5b1';
    ctx.globalAlpha = 0.7;
    for (let row = -radius; row < radius; row += 1.5) {
        const span = Math.sqrt(Math.max(0, radius * radius - row * row));
        const slope = surfaceSlope(x, y + row * 0.88, time, drops, scale);
        ctx.fillRect(x - span - slope.x * scale * 0.7, y + row * 0.88 - slope.y * scale * 0.7, span * 2, 1.5);
    }
    for (const drop of drops) {
        if (drop.onPad >= 0) continue;
        for (let ring = 0; ring < 3; ring++) {
            const r = drop.age * RAIN_SPEED * scale - ring * scale * Math.PI * 2 / RAIN_FREQUENCY;
            if (r <= 0) continue;
            ctx.globalAlpha = Math.exp(-drop.age * 0.9) * Math.min(1, (DROP_LIFETIME - drop.age) / 0.6) * 0.16 * drop.strength / (ring + 1);
            ctx.strokeStyle = '#93b4b3';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.ellipse(drop.x, drop.y, r, r * 0.82, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    ctx.restore();
}
