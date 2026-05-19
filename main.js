try {
    const canvas = document.getElementById('canvas');
    const gl = canvas.getContext('webgl2');

    new ResizeObserver(([entry]) => {
        const {width, height} = entry.contentRect;
        canvas.width = Math.round(width * devicePixelRatio);
        canvas.height = Math.round(height * devicePixelRatio);
    }).observe(canvas);

    if (!gl) {
        console.error('WebGL2 not supported');
    }

    const regl = createREGL({gl});

// A full-screen quad: two triangles covering clip space [-1, 1]
    const position = regl.buffer([
        [-1, -1], [1, -1], [1, 1],
        [-1, -1], [1, 1], [-1, 1],
    ]);

    const drawQuad = regl({
        vert: `#version 300 es
    precision mediump float;
    in vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }`,

        frag: `#version 300 es
    
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec4 cursor_pos;
    uniform vec4 target_pos;
    uniform float target_size;
    
    out vec4 fragColor;
    
    precision highp int;

    uvec2 hilbert1Dto2D(uint n, uint t) {
        uvec2 p = uvec2(0);
        for (uint s = 1u; s < (1u << n); s <<= 1u) {
            uvec2 r;
            r.x = uint((t & 0x2u) != 0u);
            r.y = uint((t & 0x1u) ^ r.x) != 0u ? 1u : 0u;
            // Rotate
            if (r.y == 0u) {
                if (r.x == 1u) { p = uvec2(s - 1u) - p.yx; }
                else { p = p.yx; }
            }
            p += s * r;
            t >>= 2u;
        }
        return p;
    }

    uvec4 hilbert2Dto4D(uint n, uvec2 t) {
        return uvec4(
            hilbert1Dto2D(n, t.x),
            hilbert1Dto2D(n, t.y)
        );
    }
    
    vec4 hilbert2Dto4Df(uint n, vec2 pos, vec2 size){
        uint cells = 1u << n;
        return size.xxyy / float(cells) * vec4(hilbert2Dto4D(n, uvec2(float(cells * cells) * pos / size)));
    }
    
    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.y;
      vec2 uv_size = vec2(u_resolution.x / u_resolution.y, 1.);
      vec4 pos = hilbert2Dto4Df(7u, uv, uv_size);
      vec4 size = uv_size.xxyy;
      
      float cursor = step(length(pos - cursor_pos), target_size);
      float target = step(length(pos - target_pos), target_size);
      
      uint cell_count = (1u << 8u);
      fragColor = vec4(vec3(float(cell_count * cell_count) / pow(2., 17.)), 1.);
      
      fragColor = vec4(vec3(cursor, target, target), 1.0);
    }
  `,

        attributes: {
            a_position: position,
        },

        uniforms: {
            // regl.context() reads built-in per-frame values
            u_resolution: (ctx) => [ctx.viewportWidth, ctx.viewportHeight],
            u_time: regl.context('time'),
            cursor_pos: (ctx, props) => props.cursor_pos,
            target_pos: (ctx, props) => props.target_pos,
            target_size: (ctx, props) => props.target_size,
        },

        count: 6,
    });

    const keys = new Set()

    addEventListener("keydown", e => {
        keys.add(e.code)
        if (e.code == "KeyH") {
            randomize()
        }
    })

    addEventListener("keyup", e => {
        keys.delete(e.code)
    })


    function* enums() {
        let n = 0
        while (true) {
            yield n
            n++
        }
    }

    const [
        left,
        right
    ] = enums()

    class TouchInfo {
        constructor(position, side) {
            this.position = position
            this.side = side
        }
    }

    const recordedTouches = new Map()

    addEventListener("touchstart", e => {
        console.log(recordedTouches.size)
        if(recordedTouches.size == 2) {
            try {
                document.body.requestFullscreen()
            }catch(e){
                console.warn("Fullscreen failed")
            }
        }
        for (const touch of e.changedTouches) {
            recordedTouches.set(touch.identifier, new TouchInfo(
                [touch.clientX, touch.clientY],
                touch.clientX < innerWidth / 2 ? left : right
            ))
        }
    })

    const touchSpeed = 1.6
    addEventListener("touchmove", e => {
        for (const touch of e.changedTouches) {
            const controller = [0, 0, 0, 0]
            const recordedTouch = recordedTouches.get(touch.identifier)
            switch (recordedTouch.side) {
                case left:
                    controller[0] += touch.clientX - recordedTouch.position[0]
                    controller[2] += touch.clientY - recordedTouch.position[1]
                    break
                case right:
                    controller[1] += touch.clientX - recordedTouch.position[0]
                    controller[3] += touch.clientY - recordedTouch.position[1]
                    break
            }
            set(cursor_pos, add(cursor_pos,
                scale(
                    controller,
                    touchSpeed / innerHeight
                )
            ))
            recordedTouch.position[0] = touch.clientX
            recordedTouch.position[1] = touch.clientY
        }
    })

    addEventListener("touchend", e => {
        for (const touch of e.changedTouches) {
            recordedTouches.delete(touch.identifier)
        }
    })

    const target_pos = [0.5, 0.5, 0.5, 0.5]
    let target_size = 0.4

    const cursor_pos = [0.5, 0.5, 0.5, 0.5]
    const dt = 1 / 100
    const speed = 4
    const friction = 0.2
    const velocity = [0, 0, 0, 0]

    function add(a, b) {
        return a.map((ai, i) => ai + b[i])
    }

    function scale(v, factor) {
        return v.map(vi => vi * factor)
    }

    function set(dst, src) {
        src.forEach((srcI, i) => dst[i] = srcI)
    }

    setInterval(() => {
        const controller = [0, 0, 0, 0]

        controller[0] += keys.has("KeyU") - keys.has("KeyJ")
        controller[1] += keys.has("KeyI") - keys.has("KeyK")
        controller[2] += keys.has("KeyO") - keys.has("KeyL")
        controller[3] += keys.has("KeyP") - keys.has("Semicolon")

        controller[0] += keys.has("KeyR") - keys.has("KeyF")
        controller[1] += keys.has("KeyE") - keys.has("KeyD")
        controller[2] += keys.has("KeyW") - keys.has("KeyS")
        controller[3] += keys.has("KeyQ") - keys.has("KeyA")

        set(velocity,
            add(
                scale(velocity, friction ** dt),
                scale(controller, speed * dt)
            )
        )
        set(cursor_pos,
            add(cursor_pos, scale(velocity, dt))
        )


        const dist = Math.sqrt(
            (cursor_pos[0] - target_pos[0]) ** 2 +
            (cursor_pos[1] - target_pos[1]) ** 2 +
            (cursor_pos[2] - target_pos[2]) ** 2 +
            (cursor_pos[3] - target_pos[3]) ** 2
        )

        if (dist < 0.1) {
            randomize()
        }
    }, 1000 * dt)

    function randomize() {
        target_pos[0] = Math.random() * innerWidth / innerHeight
        target_pos[1] = Math.random() * innerWidth / innerHeight
        target_pos[2] = Math.random()
        target_pos[3] = Math.random()
        const above = 0.2
        const below = 0.3
        target_size *= Math.exp(-below + (above + below) * Math.random())
    }

    regl.frame(() => {
        regl.clear({color: [0, 0, 0, 1]});
        drawQuad({cursor_pos: cursor_pos, target_pos: target_pos, target_size: target_size});
    });
} catch (e){
    alert(e)
}


let deferredPrompt
addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    addEventListener("touchstart", _ => deferredPrompt.prompt())
})
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
}

navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
        registration.unregister();
    }
})