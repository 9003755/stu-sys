const A4_RATIO = 210 / 297
const DETECTION_MAX_SIDE = 1400
const OUTPUT_WIDTH = 1654
const OUTPUT_HEIGHT = 2339

let openCvPromise

const loadOpenCv = async () => {
  if (!openCvPromise) {
    openCvPromise = import('@techstark/opencv-js').then(async (module) => {
      const candidate = module.default ?? module
      return typeof candidate?.then === 'function' ? candidate : candidate
    })
  }
  return openCvPromise
}

const fileToImage = (file) => new Promise((resolve, reject) => {
  const image = new Image()
  const url = URL.createObjectURL(file)
  image.onload = () => {
    URL.revokeObjectURL(url)
    resolve(image)
  }
  image.onerror = () => {
    URL.revokeObjectURL(url)
    reject(new Error('无法读取图片'))
  }
  image.src = url
})

const canvasToFile = (canvas, filename, quality = 0.96) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) {
      reject(new Error('无法生成扫描图片'))
      return
    }
    resolve(new File([blob], filename, { type: 'image/jpeg' }))
  }, 'image/jpeg', quality)
})

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

const orderCorners = (points) => {
  const bySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const topLeft = bySum[0]
  const bottomRight = bySum[3]
  const remaining = bySum.slice(1, 3)
  const [topRight, bottomLeft] = remaining[0].x > remaining[1].x
    ? [remaining[0], remaining[1]]
    : [remaining[1], remaining[0]]
  return [topLeft, topRight, bottomRight, bottomLeft]
}

const scoreCandidate = (points, imageWidth, imageHeight) => {
  const [topLeft, topRight, bottomRight, bottomLeft] = orderCorners(points)
  const width = (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2
  const height = (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2
  const portraitRatio = Math.min(width, height) / Math.max(width, height)
  const ratioScore = Math.max(0, 1 - Math.abs(portraitRatio - A4_RATIO) / 0.24)
  const area = Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length]
      return sum + point.x * next.y - next.x * point.y
    }, 0) / 2,
  )
  const areaRatio = area / (imageWidth * imageHeight)
  const borderMarginX = imageWidth * 0.025
  const borderMarginY = imageHeight * 0.025
  const borderTouches = points.filter((point) => (
    point.x < borderMarginX
    || point.x > imageWidth - borderMarginX
    || point.y < borderMarginY
    || point.y > imageHeight - borderMarginY
  )).length
  if (borderTouches >= 2) return null
  if (areaRatio < 0.18 || areaRatio > 0.98 || ratioScore < 0.25) return null
  const sizeScore = Math.min(1, areaRatio / 0.58)
  const borderScore = borderTouches === 0 ? 1 : 0.45
  return {
    corners: [topLeft, topRight, bottomRight, bottomLeft],
    areaRatio,
    score: ratioScore * 0.5 + sizeScore * 0.3 + borderScore * 0.2,
  }
}

const findBestContour = (cv, mask, imageWidth, imageHeight, retrievalMode = cv.RETR_LIST) => {
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  let best = null

  try {
    cv.findContours(mask, contours, hierarchy, retrievalMode, cv.CHAIN_APPROX_SIMPLE)

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index)
      const perimeter = cv.arcLength(contour, true)
      for (const epsilon of [0.015, 0.02, 0.025, 0.03, 0.04, 0.05]) {
        const approximation = new cv.Mat()
        cv.approxPolyDP(contour, approximation, epsilon * perimeter, true)

        if (approximation.rows === 4 && cv.isContourConvex(approximation)) {
          const points = []
          for (let pointIndex = 0; pointIndex < 4; pointIndex += 1) {
            points.push({
              x: approximation.intPtr(pointIndex, 0)[0],
              y: approximation.intPtr(pointIndex, 0)[1],
            })
          }
          const candidate = scoreCandidate(points, imageWidth, imageHeight)
          if (candidate && (!best || candidate.score > best.score)) best = candidate
        }

        approximation.delete()
        if (best?.areaRatio > 0.78) break
      }

      const contourArea = Math.abs(cv.contourArea(contour))
      if (contourArea / (imageWidth * imageHeight) > 0.18) {
        const contourPoints = []
        for (let pointIndex = 0; pointIndex < contour.rows; pointIndex += 1) {
          contourPoints.push({
            x: contour.intPtr(pointIndex, 0)[0],
            y: contour.intPtr(pointIndex, 0)[1],
          })
        }
        const extremePoints = [
          contourPoints.reduce((bestPoint, point) => (point.x + point.y < bestPoint.x + bestPoint.y ? point : bestPoint)),
          contourPoints.reduce((bestPoint, point) => (point.x - point.y > bestPoint.x - bestPoint.y ? point : bestPoint)),
          contourPoints.reduce((bestPoint, point) => (point.x + point.y > bestPoint.x + bestPoint.y ? point : bestPoint)),
          contourPoints.reduce((bestPoint, point) => (point.x - point.y < bestPoint.x - bestPoint.y ? point : bestPoint)),
        ]
        const extremeCandidate = scoreCandidate(extremePoints, imageWidth, imageHeight)
        if (extremeCandidate && (!best || extremeCandidate.score > best.score)) best = extremeCandidate

      }
      contour.delete()
    }
  } finally {
    contours.delete()
    hierarchy.delete()
  }

  return best
}

const findDocument = (cv, source) => {
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edges = new cv.Mat()
  const edgeMask = new cv.Mat()
  const rgb = new cv.Mat()
  const hsv = new cv.Mat()
  const whiteMask = new cv.Mat()
  const edgeKernel = cv.Mat.ones(9, 9, cv.CV_8U)
  const whiteKernel = cv.Mat.ones(7, 7, cv.CV_8U)
  let low
  let high

  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    cv.Canny(blurred, edges, 35, 120)
    cv.morphologyEx(edges, edgeMask, cv.MORPH_CLOSE, edgeKernel)
    const edgeCandidate = findBestContour(cv, edgeMask, source.cols, source.rows)

    cv.cvtColor(source, rgb, cv.COLOR_RGBA2RGB)
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV)
    low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 92, 0])
    high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 48, 255, 255])
    cv.inRange(hsv, low, high, whiteMask)
    cv.morphologyEx(whiteMask, whiteMask, cv.MORPH_CLOSE, whiteKernel)
    cv.morphologyEx(whiteMask, whiteMask, cv.MORPH_OPEN, edgeKernel)
    const whiteCandidate = findBestContour(cv, whiteMask, source.cols, source.rows, cv.RETR_EXTERNAL)
    if (whiteCandidate?.areaRatio > 0.28) return whiteCandidate
    return edgeCandidate ?? whiteCandidate
  } finally {
    gray.delete()
    blurred.delete()
    edges.delete()
    edgeMask.delete()
    rgb.delete()
    hsv.delete()
    whiteMask.delete()
    low?.delete()
    high?.delete()
    edgeKernel.delete()
    whiteKernel.delete()
  }
}

const drawBoundaryPreview = async (image, corners) => {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  context.strokeStyle = '#facc15'
  context.lineWidth = Math.max(8, image.naturalWidth / 220)
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(corners[0].x, corners[0].y)
  corners.slice(1).forEach((point) => context.lineTo(point.x, point.y))
  context.closePath()
  context.stroke()
  corners.forEach((point) => {
    context.beginPath()
    context.fillStyle = '#2563eb'
    context.arc(point.x, point.y, Math.max(12, image.naturalWidth / 130), 0, Math.PI * 2)
    context.fill()
  })
  return canvasToFile(canvas, 'document-boundary.jpg', 0.9)
}

const perspectiveCorrect = async (cv, image, corners) => {
  const maxSourceSide = 3000
  const sourceScale = Math.min(1, maxSourceSide / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.naturalWidth * sourceScale)
  canvas.height = Math.round(image.naturalHeight * sourceScale)
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)

  const source = cv.imread(canvas)
  const output = new cv.Mat()
  const scaled = corners.map((point) => ({ x: point.x * sourceScale, y: point.y * sourceScale }))
  const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, scaled.flatMap((point) => [point.x, point.y]))
  const destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    OUTPUT_WIDTH - 1, 0,
    OUTPUT_WIDTH - 1, OUTPUT_HEIGHT - 1,
    0, OUTPUT_HEIGHT - 1,
  ])
  const transform = cv.getPerspectiveTransform(sourcePoints, destinationPoints)

  try {
    cv.warpPerspective(
      source,
      output,
      transform,
      new cv.Size(OUTPUT_WIDTH, OUTPUT_HEIGHT),
      cv.INTER_CUBIC,
      cv.BORDER_REPLICATE,
    )
    const resultCanvas = document.createElement('canvas')
    cv.imshow(resultCanvas, output)
    return canvasToFile(resultCanvas, 'a4-perspective-corrected.jpg')
  } finally {
    source.delete()
    output.delete()
    sourcePoints.delete()
    destinationPoints.delete()
    transform.delete()
  }
}

export const correctDocumentCorners = async (file, corners) => {
  const [cv, image] = await Promise.all([loadOpenCv(), fileToImage(file)])
  const [boundary, cropped] = await Promise.all([
    drawBoundaryPreview(image, corners),
    perspectiveCorrect(cv, image, corners),
  ])
  return { boundary, cropped }
}

export const scanDocument = async (file) => {
  const [cv, image] = await Promise.all([loadOpenCv(), fileToImage(file)])
  const scale = Math.min(1, DETECTION_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight))
  const detectionCanvas = document.createElement('canvas')
  detectionCanvas.width = Math.round(image.naturalWidth * scale)
  detectionCanvas.height = Math.round(image.naturalHeight * scale)
  detectionCanvas.getContext('2d').drawImage(image, 0, 0, detectionCanvas.width, detectionCanvas.height)

  const detectionSource = cv.imread(detectionCanvas)
  let detection
  try {
    detection = findDocument(cv, detectionSource)
  } finally {
    detectionSource.delete()
  }

  if (!detection) {
    throw new Error('没有可靠识别到完整纸张边界，请让整张 A4 纸完整入镜，并与背景保持明显对比后重拍。')
  }

  const corners = detection.corners.map((point) => ({ x: point.x / scale, y: point.y / scale }))
  const [boundary, cropped] = await Promise.all([
    drawBoundaryPreview(image, corners),
    perspectiveCorrect(cv, image, corners),
  ])

  return {
    original: file,
    boundary,
    cropped,
    corners,
    imageWidth: image.naturalWidth,
    imageHeight: image.naturalHeight,
    confidence: Math.min(99, Math.round(62 + detection.score * 37)),
  }
}
