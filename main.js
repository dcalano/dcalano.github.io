const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x000000, 0.0008) // Hide distant spawning of particles

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000)
camera.position.z = 5

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.getElementById('canvas-container').appendChild(renderer.domElement)

// Background stars
const starGeometry = new THREE.BufferGeometry()
const starCount = 3000
const starPos = new Float32Array(starCount * 3)

for (let i = 0; i < starCount * 3; i += 3) {
  starPos[i] = (Math.random() - 0.5) * 1000
  starPos[i+1] = (Math.random() - 0.5) * 1000
  starPos[i+2] = (Math.random() - 0.5) * 1000
}

starGeometry.setAttribute('position', new THREE.BufferAttribute(starPos, 3))

const getCircleTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d')

  ctx.beginPath()
  ctx.arc(16, 16, 15, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  return new THREE.CanvasTexture(canvas)
}

const starMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 1,
  sizeAttenuation: true,
  map: getCircleTexture(),
  transparent: true,
  alphaTest: 0.5
})

const stars = new THREE.Points(starGeometry, starMaterial)
scene.add(stars)

// Wormhole
const PARTICLE_COUNT = 4000
const APEX_Z = -1500
const BASE_Z = 200
const APEX_RADIUS = 1
const BASE_RADIUS = 300

const whGeo = new THREE.BufferGeometry()
const whPos = new Float32Array(PARTICLE_COUNT * 3)
const whAlpha = new Float32Array(PARTICLE_COUNT)

const whProgress = new Float32Array(PARTICLE_COUNT)
const whAngle = new Float32Array(PARTICLE_COUNT) // Angular offset
const whSpeed = new Float32Array(PARTICLE_COUNT) // Speed variation
const whActive = new Uint8Array(PARTICLE_COUNT)  // 1 if active, 0 if waiting

for (let i = 0; i < PARTICLE_COUNT; i++) {
  whPos[i*3] = 0
  whPos[i*3+1] = 0
  whPos[i*3+2] = APEX_Z
  whProgress[i] = 0
  whActive[i] = 0
  whAngle[i] = Math.random() * Math.PI * 2
  whSpeed[i] = 0.002 + Math.random() * 0.006
  whAlpha[i] = 0
}

whGeo.setAttribute('position', new THREE.BufferAttribute(whPos, 3))
whGeo.setAttribute('alpha', new THREE.BufferAttribute(whAlpha, 1))

const whMat = new THREE.ShaderMaterial({
  uniforms: {
    color: { value: new THREE.Color(0xffffff) }
  },
  vertexShader: `
      attribute float alpha;
      varying float vAlpha;
      void main() {
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 3.0 * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
      }
  `,
  fragmentShader: `
      uniform vec3 color;
      varying float vAlpha;
      void main() {
          if (length(gl_PointCoord - vec2(0.5, 0.5)) > 0.5) discard;
          gl_FragColor = vec4(color, vAlpha);
      }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending
})

const wormhole = new THREE.Points(whGeo, whMat)
scene.add(wormhole)

let currentSection = 0
let isTransitioning = false
let particlesSpawning = false
let tunnelTarget = { x: 0, y: 0 }

const sections = document.querySelectorAll('.section-wrapper')
const dots = document.querySelectorAll('.nav-dot')

const animate = () => {
  requestAnimationFrame(animate)

  stars.rotation.z += 0.0005

  const positions = whGeo.attributes.position.array
  const alphas = whGeo.attributes.alpha.array
  let activeCount = 0

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    if (whActive[i]) {
      activeCount++

      const speed = whSpeed[i] * (1 + whProgress[i] * 4)
      whProgress[i] += speed

      // Linear interpolation from APEX_Z to BASE_Z
      const z = APEX_Z + (BASE_Z - APEX_Z) * whProgress[i]

      // Cone radius: r = lerp(apex_r, base_r, progress)
      const r = APEX_RADIUS + (BASE_RADIUS - APEX_RADIUS) * Math.pow(whProgress[i], 2)

      const currentAngle = whAngle[i] + (whProgress[i] * 10)

      // Curve calculation
      const distFactor = 1.0 - whProgress[i]
      // Quadratic curve offset: 0 at camera, max at Apex
      const curveX = tunnelTarget.x * distFactor * distFactor
      const curveY = tunnelTarget.y * distFactor * distFactor

      // Subtle sine-wave "spine" twist
      const twistX = Math.sin(whProgress[i] * 6.0) * 50.0 * distFactor
      const twistY = Math.cos(whProgress[i] * 6.0) * 50.0 * distFactor

      positions[i*3] = Math.cos(currentAngle) * r + curveX + twistX
      positions[i*3+1] = Math.sin(currentAngle) * r + curveY + twistY
      positions[i*3+2] = z

      // Fade in, fade out
      if (whProgress[i] < 0.1) alphas[i] = whProgress[i] * 10
      else if (whProgress[i] > 0.9) alphas[i] = (1 - whProgress[i]) * 10
      else alphas[i] = 1

      if (whProgress[i] >= 1) {
        whActive[i] = 0
        alphas[i] = 0
        positions[i*3+2] = APEX_Z
      }
    } else if (particlesSpawning) {
      if (Math.random() < 0.05) {
        whActive[i] = 1
        whProgress[i] = 0
        whAngle[i] = Math.random() * Math.PI * 2
        positions[i*3+2] = APEX_Z
      }
    }
  }

  whGeo.attributes.position.needsUpdate = true
  whGeo.attributes.alpha.needsUpdate = true

  renderer.render(scene, camera)
}
animate()

const startTransition = (targetIndex) => {
  if (isTransitioning || targetIndex === currentSection) return
  isTransitioning = true

  tunnelTarget.x = (Math.random() - 0.5) * 1200
  tunnelTarget.y = (Math.random() - 0.5) * 1200

  dots.forEach((d, i) => d.classList.toggle('active', i === targetIndex))

  const oldSection = sections[currentSection]
  const newSection = sections[targetIndex]

  particlesSpawning = true

  gsap.to(oldSection, {
    duration: 1.5,
    opacity: 0,
    scale: 0.5,
    z: -500,
    ease: "power2.in",
    onComplete: () => {
      oldSection.classList.remove('active')
      oldSection.style.visibility = 'hidden'
      gsap.set(oldSection, { scale: 1, z: 0 })
    }
  })

  setTimeout(() => {
    particlesSpawning = false

    newSection.classList.add('active')
    newSection.style.visibility = 'visible'

    gsap.set(newSection, {
      opacity: 0,
      scale: 0.2,
      z: -1000
    })

    gsap.to(newSection, {
      duration: 2.0,
      opacity: 1,
      scale: 1,
      z: 0,
      ease: "expo.out",
      onComplete: () => {
        isTransitioning = false
        currentSection = targetIndex
      }
    })

  }, 1900)
}

dots.forEach(dot => {
  dot.addEventListener('click', () => {
    startTransition(parseInt(dot.dataset.section))
  })
})

let scrollTimeout
window.addEventListener('wheel', (e) => {
  if (isTransitioning) return
  clearTimeout(scrollTimeout)

  // Debounce scroll
  scrollTimeout = setTimeout(() => {
    if (e.deltaY > 0 && currentSection < sections.length - 1) {
      startTransition(currentSection + 1)
    } else if (e.deltaY < 0 && currentSection > 0) {
      startTransition(currentSection - 1)
    }
  }, 50)
})

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

document.addEventListener('mousemove', (e) => {
  if (!isTransitioning) {
    const x = (e.clientX / window.innerWidth - 0.5) * 2
    const y = (e.clientY / window.innerHeight - 0.5) * 2

    gsap.to(camera.position, {
      x: x * 2,
      y: -y * 2,
      duration: 1
    })

    gsap.to(camera.rotation, {
      x: -y * 0.05,
      y: -x * 0.05,
      duration: 1
    })
  }
})