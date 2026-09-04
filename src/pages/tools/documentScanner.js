import cvModule from '@techstark/opencv-js'

const OUTPUT_WIDTH = 1654
const OUTPUT_HEIGHT = 2339
let cvPromise

const loadCv = async () => {
  if (!cvPromise) {
    cvPromise = (async () => {
      if (cvModule instanceof Promise) return cvModule
      if (cvModule?.Mat) return cvModule
      await new Promise((resolve, reject) => {
        cvModule.onRuntimeInitialized = resolve
        cvModule.onAbort = reject
      })
      return cvModule
    })()
  }
  return cvPromise
}

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
  }, 'image/jpeg', 0.96)
})

export const defaultCorners = (width, height) => [
  { x: width * 0.08, y: height * 0.08 },
  { x: width * 0.92, y: height * 0.08 },
  { x: width * 0.92, y: height * 0.92 },
  { x: width * 0.08, y: height * 0.92 },
]

export const createScan = async (file, corners) => {
  const [cv, image] = await Promise.all([loadCv(), readImage(file)])
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  canvas.getContext('2d').drawImage(image, 0, 0)
  const source = cv.imread(canvas)
  const target = new cv.Mat()
  const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap((point) => [point.x, point.y]))
  const targetPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, OUTPUT_WIDTH - 1, 0, OUTPUT_WIDTH - 1, OUTPUT_HEIGHT - 1, 0, OUTPUT_HEIGHT - 1])
  const transform = cv.getPerspectiveTransform(sourcePoints, targetPoints)
  try {
    cv.warpPerspective(source, target, transform, new cv.Size(OUTPUT_WIDTH, OUTPUT_HEIGHT), cv.INTER_CUBIC, cv.BORDER_REPLICATE)
    const resultCanvas = document.createElement('canvas')
    cv.imshow(resultCanvas, target)
    return { original: file, cropped: await toFile(resultCanvas, 'a4-scanned.jpg'), width: image.naturalWidth, height: image.naturalHeight, corners }
  } finally {
    source.delete(); target.delete(); sourcePoints.delete(); targetPoints.delete(); transform.delete()
  }
}
