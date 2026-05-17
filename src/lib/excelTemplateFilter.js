import ExcelJS from 'exceljs'

const HEADER_ROW_NUMBER = 1

function normalizeHeader(value) {
  if (value === null || value === undefined) return ''

  return String(value)
    .replace(/\r?\n/g, ' ')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function getDisplayHeader(value) {
  if (value === null || value === undefined) return ''

  return String(value)
    .replace(/\r?\n/g, ' ')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function loadWorkbookFromArrayBuffer(arrayBuffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(arrayBuffer)
  return workbook
}

function getFirstWorksheet(workbook, label) {
  const worksheet = workbook.getWorksheet(1)

  if (!worksheet) {
    throw new Error(`${label}没有可读取的工作表`)
  }

  return worksheet
}

function getHeaderCells(worksheet) {
  const headerRow = worksheet.getRow(HEADER_ROW_NUMBER)
  const maxCellCount = Math.max(headerRow.cellCount || 0, headerRow.actualCellCount || 0)
  const headers = []

  for (let col = 1; col <= maxCellCount; col += 1) {
    const displayHeader = getDisplayHeader(headerRow.getCell(col).value)
    const normalizedHeader = normalizeHeader(displayHeader)

    if (!displayHeader && !normalizedHeader) continue

    headers.push({
      columnNumber: col,
      displayHeader,
      normalizedHeader,
    })
  }

  return headers
}

function buildHeaderIndex(headers) {
  const headerIndex = new Map()

  headers.forEach((header) => {
    if (!header.normalizedHeader) return
    if (headerIndex.has(header.normalizedHeader)) return

    headerIndex.set(header.normalizedHeader, header)
  })

  return headerIndex
}

function isRowEmpty(row, columnNumbers) {
  return columnNumbers.every((columnNumber) => {
    const value = row.getCell(columnNumber).value
    return value === null || value === undefined || String(value).trim() === ''
  })
}

function clearWorksheetDataRows(worksheet) {
  while (worksheet.rowCount > HEADER_ROW_NUMBER) {
    worksheet.spliceRows(HEADER_ROW_NUMBER + 1, 1)
  }
}

export async function readTemplateHeadersFromUrl(templateUrl = '/stuIm.xlsx') {
  const response = await fetch(templateUrl)
  if (!response.ok) {
    throw new Error('无法加载模板文件 stuIm.xlsx')
  }

  const workbook = await loadWorkbookFromArrayBuffer(await response.arrayBuffer())
  const worksheet = getFirstWorksheet(workbook, '模板文件')
  const headers = getHeaderCells(worksheet)

  if (headers.length === 0) {
    throw new Error('模板第一行没有可识别的表头')
  }

  return headers
}

export async function analyzeSourceWorkbook(file, templateHeaders) {
  if (!file) {
    throw new Error('请先选择源 Excel 文件')
  }

  const workbook = await loadWorkbookFromArrayBuffer(await file.arrayBuffer())
  const worksheet = getFirstWorksheet(workbook, '源 Excel')
  const sourceHeaders = getHeaderCells(worksheet)

  if (sourceHeaders.length === 0) {
    throw new Error('源 Excel 第一行没有可识别的表头')
  }

  const templateHeaderIndex = buildHeaderIndex(templateHeaders)
  const sourceHeaderIndex = buildHeaderIndex(sourceHeaders)

  const matchedHeaders = templateHeaders.filter((header) => sourceHeaderIndex.has(header.normalizedHeader))
  const missingTemplateHeaders = templateHeaders.filter((header) => !sourceHeaderIndex.has(header.normalizedHeader))
  const extraSourceHeaders = sourceHeaders.filter((header) => !templateHeaderIndex.has(header.normalizedHeader))

  return {
    worksheetName: worksheet.name,
    sourceHeaders,
    matchedHeaders,
    missingTemplateHeaders,
    extraSourceHeaders,
  }
}

export async function generateWorkbookFromTemplate({
  sourceFile,
  templateUrl = '/stuIm.xlsx',
}) {
  if (!sourceFile) {
    throw new Error('请先选择源 Excel 文件')
  }

  const [templateHeaders, sourceWorkbook, templateResponse] = await Promise.all([
    readTemplateHeadersFromUrl(templateUrl),
    loadWorkbookFromArrayBuffer(await sourceFile.arrayBuffer()),
    fetch(templateUrl),
  ])

  if (!templateResponse.ok) {
    throw new Error('无法加载模板文件 stuIm.xlsx')
  }

  const sourceWorksheet = getFirstWorksheet(sourceWorkbook, '源 Excel')
  const sourceHeaders = getHeaderCells(sourceWorksheet)

  if (sourceHeaders.length === 0) {
    throw new Error('源 Excel 第一行没有可识别的表头')
  }

  const templateWorkbook = await loadWorkbookFromArrayBuffer(await templateResponse.arrayBuffer())
  const templateWorksheet = getFirstWorksheet(templateWorkbook, '模板文件')
  const sourceHeaderIndex = buildHeaderIndex(sourceHeaders)

  clearWorksheetDataRows(templateWorksheet)

  const sourceColumnNumbers = sourceHeaders.map((header) => header.columnNumber)
  let outputRowCount = 0

  for (let rowNumber = HEADER_ROW_NUMBER + 1; rowNumber <= sourceWorksheet.rowCount; rowNumber += 1) {
    const sourceRow = sourceWorksheet.getRow(rowNumber)
    if (isRowEmpty(sourceRow, sourceColumnNumbers)) continue

    const rowValues = templateHeaders.map((templateHeader) => {
      const matchedSourceHeader = sourceHeaderIndex.get(templateHeader.normalizedHeader)
      if (!matchedSourceHeader) return ''

      return sourceRow.getCell(matchedSourceHeader.columnNumber).value
    })

    templateWorksheet.addRow(rowValues)
    outputRowCount += 1
  }

  const buffer = await templateWorkbook.xlsx.writeBuffer()
  const missingTemplateHeaders = templateHeaders.filter(
    (templateHeader) => !sourceHeaderIndex.has(templateHeader.normalizedHeader),
  )

  return {
    buffer,
    outputRowCount,
    templateHeaders,
    sourceHeaders,
    missingTemplateHeaders,
  }
}

export function buildOutputFileName(sourceFileName) {
  const safeName = sourceFileName.replace(/\.[^.]+$/, '')
  return `${safeName}_按模板整理.xlsx`
}
