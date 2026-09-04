const OUTPUT_WIDTH = 1654
const OUTPUT_HEIGHT = 2339
const GRID_COLUMNS = 20
const GRID_ROWS = 28

const readImage = (file) => new Promise((resolve, reject) => {
  const image = new Image()
  const url = URL.createObjectURL(file)
  image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取图片')) }
  image.src = url
})

const toFile = (canvas, name) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) return reject(new Error('无法生成扫描件'))
    resolve(new File([blob], name, { type: 'image/jpeg' }))
  }, 'image/jpeg', 0.94)
})

const createProjector = ([topLeft, topRight, bottomRight, bottomLeft]) => {
  const dx1 = topRight.x - bottomRight.x
  const dx2 = bottomLeft.x - bottomRight.x
  const dx3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x
  const dy1 = topRight.y - bottomRight.y
  const dy2 = bottomLeft.y - bottomRight.y
  const dy3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y
  const denominator = dx1 * dy2 - dx2 * dy1
  const g = Math.abs(denominator) < 0.0001 ? 0 : (dx3 * dy2 - dx2 * dy3) / denominator
  const h = Math.abs(denominator) < 0.0001 ? 0 : (dx1 * dy3 - dx3 * dy1) / denominator
  const a = topRight.x - topLeft.x + g * topRight.x
  const b = bottomLeft.x - topLeft.x + h * bottomLeft.x
  const d = topRight.y - topLeft.y + g * topRight.y
  const e = bottomLeft.y - topLeft.y + h * bottomLeft.y

  return (u, v) => {
    const scale = g * u + h * v + 1
    if (Math.abs(scale) < 0.0001) throw new Error('四个角点位置无效，请重新调整')
    return {
      x: (a * u + b * v + topLeft.x) / scale,
      y: (d * u + e * v + topLeft.y) / scale,
    }
  }
}

const drawTriangle = (context, image, source, target) => {
  const [s0, s1, s2] = source
  const [t0, t1, t2] = target
  const denominator = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y)
  if (Math.abs(denominator) < 0.0001) return

  const a = (t0.x * (s1.y - s2.y) + t1.x * (s2.y - s0.y) + t2.x * (s0.y - s1.y)) / denominator
  const c = (t0.x * (s2.x - s1.x) + t1.x * (s0.x - s2.x) + t2.x * (s1.x - s0.x)) / denominator
  const e = (t0.x * (s1.x * s2.y - s2.x * s1.y) + t1.x * (s2.x * s0.y - s0.x * s2.y) + t2.x * (s0.x * s1.y - s1.x * s0.y)) / denominator
  const b = (t0.y * (s1.y - s2.y) + t1.y * (s2.y - s0.y) + t2.y * (s0.y - s1.y)) / denominator
  const d = (t0.y * (s2.x - s1.x) + t1.y * (s0.x - s2.x) + t2.y * (s1.x - s0.x)) / denominator
  const f = (t0.y * (s1.x * s2.y - s2.x * s1.y) + t1.y * (s2.x * s0.y - s0.x * s2.y) + t2.y * (s0.x * s1.y - s1.x * s0.y)) / denominator

  context.save()
  context.beginPath()
  context.moveTo(t0.x, t0.y)
  context.lineTo(t1.x, t1.y)
  context.lineTo(t2.x, t2.y)
  context.closePath()
  context.clip()
  context.setTransform(a, b, c, d, e, f)
  context.drawImage(image, 0, 0)
  context.restore()
}

const polygonArea = (corners) => Math.abs(corners.reduce((sum, point, index) => {
  const next = corners[(index + 1) % corners.length]
  return sum + point.x * next.y - next.x * point.y
}, 0) / 2)

export const defaultCorners = (width, height) => [
  { x: width * 0.08, y: height * 0.08 },
  { x: width * 0.92, y: height * 0.08 },
  { x: width * 0.92, y: height * 0.92 },
  { x: width * 0.08, y: height * 0.92 },
]

export const createScan = async (file, corners) => {
  const image = await readImage(file)
  if (polygonArea(corners) < image.naturalWidth * image.naturalHeight * 0.01) {
    throw new Error('四个角点围成的区域太小，请重新调整')
  }

  const resultCanvas = document.createElement('canvas')
  resultCanvas.width = OUTPUT_WIDTH
  resultCanvas.height = OUTPUT_HEIGHT
  const context = resultCanvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('当前浏览器无法生成扫描件，请改用系统浏览器')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT)

  const project = createProjector(corners)
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const u0 = column / GRID_COLUMNS
      const u1 = (column + 1) / GRID_COLUMNS
      const v0 = row / GRID_ROWS
      const v1 = (row + 1) / GRID_ROWS
      const sourceTopLeft = project(u0, v0)
      const sourceTopRight = project(u1, v0)
      const sourceBottomRight = project(u1, v1)
      const sourceBottomLeft = project(u0, v1)
      const targetTopLeft = { x: u0 * OUTPUT_WIDTH, y: v0 * OUTPUT_HEIGHT }
      const targetTopRight = { x: u1 * OUTPUT_WIDTH, y: v0 * OUTPUT_HEIGHT }
      const targetBottomRight = { x: u1 * OUTPUT_WIDTH, y: v1 * OUTPUT_HEIGHT }
      const targetBottomLeft = { x: u0 * OUTPUT_WIDTH, y: v1 * OUTPUT_HEIGHT }

      drawTriangle(context, image, [sourceTopLeft, sourceTopRight, sourceBottomRight], [targetTopLeft, targetTopRight, targetBottomRight])
      drawTriangle(context, image, [sourceTopLeft, sourceBottomRight, sourceBottomLeft], [targetTopLeft, targetBottomRight, targetBottomLeft])
    }
  }

  context.setTransform(1, 0, 0, 1, 0, 0)
  return {
    original: file,
    cropped: await toFile(resultCanvas, 'a4-scanned.jpg'),
    width: image.naturalWidth,
    height: image.naturalHeight,
    corners,
  }
}
