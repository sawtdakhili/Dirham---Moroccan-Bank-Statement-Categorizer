import * as pdfjsLib from "pdfjs-dist"
import { DefaultCategories } from "../config/parsing"

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.4.54/build/pdf.worker.mjs`

export interface ParsedTransaction {
  code?: string
  date: string
  description: string
  amount: number
  category?: string
  type: "expense" | "income"
}

export class PDFParserService {
  static async parsePDF(file: File): Promise<ParsedTransaction[]> {
    try {
      console.log("🚀 Starting multi-bank PDF parsing...")
      console.log(`[v0] File details: name="${file.name}", size=${file.size} bytes, type="${file.type}"`)

      if (file.size > 10 * 1024 * 1024) {
        throw new Error("PDF file is too large. Please use a file smaller than 10MB.")
      }

      return await this.withTimeout(this.parsePDFInternal(file), 15000)
    } catch (error) {
      console.error("[v0] PDF parsing error details:", error)
      console.error("[v0] Error message:", error.message)
      console.error("[v0] Error stack:", error.stack)

      if (error.message?.includes("timeout")) {
        throw new Error("PDF processing timed out. Please try a smaller PDF file.")
      }

      throw new Error(`PDF processing failed: ${error.message}`)
    }
  }

  private static withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ])
  }

  private static async parsePDFInternal(file: File): Promise<ParsedTransaction[]> {
    try {
      console.log("[v0] Reading file buffer...")
      const arrayBuffer = await file.arrayBuffer()
      console.log(`[v0] File buffer size: ${arrayBuffer.byteLength} bytes`)

      console.log("[v0] Initializing PDF document...")
      const pdf = await this.withTimeout(
        pdfjsLib.getDocument({
          data: arrayBuffer,
          disableWorker: true,
          disableAutoFetch: true,
          disableStream: true,
          verbosity: 0,
        }).promise,
        5000,
      )

      console.log(`[v0] PDF loaded successfully. Pages: ${pdf.numPages}`)

      const maxPages = Math.min(pdf.numPages, 5)
      console.log(`[v0] Processing ${maxPages} pages`)

      const extractedLines = await this.extractTextFromPDF(pdf, maxPages)
      console.log(`[v0] Extracted ${extractedLines.length} lines`)

      console.log("[v0] === RAW PDF TEXT SAMPLE ===")
      console.log(extractedLines.slice(0, 10).join("\n"))
      console.log("[v0] === END SAMPLE ===")

      console.log("[v0] 🔧 Starting enhanced multi-bank parsing...")
      const result = this.parseBankStatementPDF(extractedLines)
      console.log(`[v0] Parsed ${result.transactions.length} transactions from ${result.bank} bank`)

      return result.transactions.map((t) => ({
        code: t.code,
        date: t.operationDateISO || t.valueDateISO || t.valueDate || "UNKNOWN",
        description: t.description,
        amount: t.amountNumeric,
        category: this.assignCategory(t.description, t.isExpense ? "expense" : "income"),
        type: t.isExpense ? "expense" : "income",
      }))
    } catch (error) {
      console.error("[v0] parsePDFInternal error:", error)
      console.error("[v0] Error occurred at stage:", error.message)
      throw error
    }
  }

  private static detectBankType(textLines: string[]): any {
    // Defensive check for input
    if (!textLines || !Array.isArray(textLines)) {
      console.error("detectBankType: textLines is not a valid array")
      return { bank: "unknown", config: null }
    }

    const text = textLines.join(" ").toLowerCase()

    const bankPatterns = {
      cih: {
        indicators: [
          "cih bank",
          "cih.co.ma",
          "releve de compte bancaire",
          "cih",
          "mediateur@cih.co.ma",
          "reclamations-clients@cih.co.ma",
        ],
        structure: "table_format",
        dateFormat: "dd/mm dd/mm",
        hasTransactionCodes: false,
      },
      attijariwafa: {
        indicators: ["attijariwafa", "wafabank", "attijariwafa bank"],
        structure: "line_format",
        dateFormat: "dd mm yyyy",
        hasTransactionCodes: true,
      },
    }

    // Check for bank-specific indicators
    for (const [bankName, config] of Object.entries(bankPatterns)) {
      // Defensive check for indicators array
      if (!config.indicators || !Array.isArray(config.indicators)) {
        console.warn(`Bank config for ${bankName} has invalid indicators`)
        continue
      }

      try {
        const hasIndicators = config.indicators.some((indicator) => {
          return typeof indicator === "string" && text.includes(indicator)
        })

        if (hasIndicators) {
          console.log(`Detected bank: ${bankName} using indicators`)
          return { bank: bankName, config: config }
        }
      } catch (error) {
        console.error(`Error checking indicators for ${bankName}:`, error)
        continue
      }
    }

    // Fallback detection based on actual patterns
    console.log("Primary detection failed, trying pattern-based detection...")

    // Check for CIH-style date format DD/MM DD/MM
    const hasCIHDatePattern = textLines.some((line) => {
      return line && typeof line === "string" && /\d{2}\/\d{2}\s+\d{2}\/\d{2}/.test(line.trim())
    })

    if (hasCIHDatePattern) {
      console.log("Detected CIH bank using DD/MM DD/MM date pattern")
      return { bank: "cih", config: bankPatterns.cih }
    }

    // Check for Attijariwafa transaction codes
    const hasAWBPattern = textLines.some(
      (line) => line && typeof line === "string" && /^0\d{3}[A-Z0-9]{2}\s+\d{2}\s+\d{2}/.test(line.trim()),
    )

    if (hasAWBPattern) {
      console.log("Detected Attijariwafa bank using transaction code pattern")
      return { bank: "attijariwafa", config: bankPatterns.attijariwafa }
    }

    console.log("Could not detect bank type")
    return { bank: "unknown", config: null }
  }

  private static parseBankStatementPDF(textLines: string[]): any {
    console.log("Starting multi-bank PDF statement parsing...")

    // Defensive input validation
    if (!textLines) {
      console.error("Error: textLines is undefined or null")
      return {
        bank: "Unknown",
        openingBalance: null,
        closingBalance: null,
        totalMovements: null,
        transactions: [],
        metadata: {
          totalLines: 0,
          parsedTransactions: 0,
          failedLines: [],
          dateFormat: "Unknown",
          currency: "MAD",
          parseQuality: 0,
          detectedBank: "unknown",
          error: "Input textLines is undefined or null",
        },
      }
    }

    if (!Array.isArray(textLines)) {
      console.error("Error: textLines is not an array", typeof textLines)
      return {
        bank: "Unknown",
        openingBalance: null,
        closingBalance: null,
        totalMovements: null,
        transactions: [],
        metadata: {
          totalLines: 0,
          parsedTransactions: 0,
          failedLines: [],
          dateFormat: "Unknown",
          currency: "MAD",
          parseQuality: 0,
          detectedBank: "unknown",
          error: `Input textLines is not an array: ${typeof textLines}`,
        },
      }
    }

    console.log(`Total input lines: ${textLines.length}`)

    // Debug: Show first 15 lines
    console.log("\nFirst 15 lines for debugging:")
    textLines.slice(0, 15).forEach((line, index) => {
      console.log(`${index + 1}: "${line || "(empty)"}"`)
    })

    // Analyze line patterns
    console.log("\nAnalyzing line patterns:")
    const patterns = {
      "CIH Date format (DD/MM DD/MM)": /\d{2}\/\d{2}\s+\d{2}\/\d{2}/,
      "CIH Transactions": /^\d{2}\/\d{2}\s+\d{2}\/\d{2}\s+[A-Z].*\d+,\d{2}$/,
      "AWB Transaction codes": /^0\d{3}[A-Z0-9]{2}/,
      "AWB Date format (DD MM)": /^0\d{3}[A-Z0-9]{2}\s+\d{2}\s+\d{2}/,
      "Balance lines": /SOLDE|TOTAL/,
      "Amount lines": /\d+,\d{2}$/,
      "Year references": /20\d{2}/,
    }

    Object.entries(patterns).forEach(([name, pattern]) => {
      try {
        const count = textLines.filter((line) => line && typeof line === "string" && pattern.test(line.trim())).length
        console.log(`${name}: ${count} lines`)
      } catch (error) {
        console.error(`Error analyzing pattern ${name}:`, error.message)
      }
    })

    // Bank detection
    const bankDetection = this.detectBankType(textLines)
    console.log(`\nDetected bank: ${bankDetection.bank}`)

    if (bankDetection.bank === "unknown") {
      console.warn("Could not detect bank type, defaulting to Attijariwafa format")
    }

    // Parse using appropriate method
    let result

    try {
      switch (bankDetection.bank) {
        case "cih":
          result = this.parseCIHStatement(textLines)
          break
        case "attijariwafa":
        default:
          result = this.parseAttijariwafaStatement(textLines)
          break
      }
    } catch (error) {
      console.error("Error during parsing:", error.message)
      return {
        bank: bankDetection.bank || "Unknown",
        openingBalance: null,
        closingBalance: null,
        totalMovements: null,
        transactions: [],
        metadata: {
          totalLines: textLines.length,
          parsedTransactions: 0,
          failedLines: [],
          dateFormat: "Unknown",
          currency: "MAD",
          parseQuality: 0,
          detectedBank: bankDetection.bank,
          error: `Parsing error: ${error.message}`,
        },
      }
    }

    // Defensive check for result
    if (!result || typeof result !== "object") {
      console.error("Parser returned invalid result")
      return {
        bank: bankDetection.bank || "Unknown",
        openingBalance: null,
        closingBalance: null,
        totalMovements: null,
        transactions: [],
        metadata: {
          totalLines: textLines.length,
          parsedTransactions: 0,
          failedLines: [],
          dateFormat: "Unknown",
          currency: "MAD",
          parseQuality: 0,
          detectedBank: bankDetection.bank,
          error: "Parser returned invalid result",
        },
      }
    }

    // Ensure transactions array exists and all transactions have required properties
    if (!result.transactions || !Array.isArray(result.transactions)) {
      result.transactions = []
    }

    // Ensure all transactions have complete properties
    result.transactions = result.transactions
      .map((txn, index) => {
        if (!txn || typeof txn !== "object") {
          console.warn(`Transaction ${index} is invalid, skipping`)
          return null
        }

        return {
          code: txn.code || null,
          operationDate: txn.operationDate || null,
          valueDate: txn.valueDate || null,
          description: txn.description || "Unknown transaction",
          amount: txn.amount || "0,00",
          amountNumeric: typeof txn.amountNumeric === "number" ? txn.amountNumeric : 0,
          debitCreditType: txn.debitCreditType || "debit",
          transactionType: txn.transactionType || "other",
          operationDateISO: txn.operationDateISO || null,
          valueDateISO: txn.valueDateISO || null,
          isExpense: typeof txn.isExpense === "boolean" ? txn.isExpense : true,
          isIncome: typeof txn.isIncome === "boolean" ? txn.isIncome : false,
          rawLine: txn.rawLine || "",
          // Add additional properties that categorization might expect
          category: txn.category || null,
          subcategory: txn.subcategory || null,
          tags: txn.tags || [],
          merchant: txn.merchant || null,
          location: txn.location || null,
        }
      })
      .filter((txn) => txn !== null) // Remove any invalid transactions

    // Ensure metadata exists and has all required properties
    if (!result.metadata || typeof result.metadata !== "object") {
      result.metadata = {}
    }

    const totalTransactionLines = (result.metadata.failedLines?.length || 0) + result.transactions.length
    result.metadata = {
      totalLines: result.metadata.totalLines || textLines.length,
      parsedTransactions: result.transactions.length,
      failedLines: result.metadata.failedLines || [],
      dateFormat: result.metadata.dateFormat || "Unknown",
      currency: result.metadata.currency || "MAD",
      parseQuality:
        totalTransactionLines > 0 ? Math.round((result.transactions.length / totalTransactionLines) * 100) : 100,
      detectedBank: bankDetection.bank,
      bankConfig: bankDetection.config,
      statementYear: result.metadata.statementYear || null,
      error: result.metadata.error || null,
    }

    // Enhanced reporting
    console.log(`\n✅ Parsing complete: ${result.metadata.parsedTransactions} transactions parsed`)
    console.log(`📊 Parse quality: ${result.metadata.parseQuality}%`)
    console.log(`🏦 Bank: ${result.bank}`)

    if (result.metadata.statementYear) {
      console.log(`📅 Statement year: ${result.metadata.statementYear}`)
    }

    if (result.metadata.failedLines && result.metadata.failedLines.length > 0) {
      console.log(`⚠️  Failed to parse ${result.metadata.failedLines.length} lines:`)
      result.metadata.failedLines.slice(0, 3).forEach((failed) => {
        console.log(`   Line ${failed.lineNumber}: "${failed.line}" - ${failed.reason || failed.error}`)
      })
    }

    // Show sample transactions for verification
    if (result.transactions.length > 0) {
      console.log(`\n📝 Sample transactions (showing amounts with correct signs):`)
      result.transactions.slice(0, 3).forEach((txn, index) => {
        const sign = txn.amountNumeric >= 0 ? "+" : ""
        console.log(
          `${index + 1}. ${txn.description.substring(0, 40)}... | ${sign}${txn.amountNumeric} MAD | ${txn.debitCreditType.toUpperCase()}`,
        )
      })
    }

    // Critical validation
    if (result.metadata.parsedTransactions === 0) {
      console.error("\n❌ NO TRANSACTIONS WERE PARSED!")
      console.log("\nDIAGNOSTIC INFORMATION:")
      console.log(`- Total lines processed: ${textLines.length}`)
      console.log(`- Bank detection: ${bankDetection.bank}`)
      console.log(`- Failed lines: ${result.metadata.failedLines.length}`)

      console.log("\nShowing lines that contain dates and amounts (potential transactions):")
      textLines.forEach((line, index) => {
        if (line && typeof line === "string") {
          if ((/\d{2}\/\d{2}/.test(line) || /^0\d{3}[A-Z0-9]{2}/.test(line)) && /\d+,\d{2}/.test(line)) {
            console.log(`${index + 1}: "${line}"`)
          }
        }
      })

      throw new Error("NO TRANSACTIONS WERE PARSED!")
    }

    return result
  }

  private static parseCIHStatement(textLines: string[]): any {
    console.log("Parsing CIH Bank statement with correct date format...")

    // Defensive input validation
    if (!textLines || !Array.isArray(textLines)) {
      console.error("parseCIHStatement: Invalid textLines input")
      return {
        bank: "CIH",
        openingBalance: null,
        closingBalance: null,
        totalMovements: null,
        transactions: [],
        metadata: {
          totalLines: 0,
          parsedTransactions: 0,
          failedLines: [],
          dateFormat: "DD/MM DD/MM (year separate)",
          currency: "MAD",
          statementYear: null,
          error: "Invalid input to parseCIHStatement",
        },
      }
    }

    console.log(`Input lines count: ${textLines.length}`)

    const result = {
      bank: "CIH",
      openingBalance: null,
      closingBalance: null,
      totalMovements: null,
      transactions: [],
      metadata: {
        totalLines: textLines.length,
        parsedTransactions: 0,
        failedLines: [],
        dateFormat: "DD/MM DD/MM (year separate)",
        currency: "MAD",
        statementYear: null,
      },
    }

    // Step 1: Extract the statement year from closing balance or other date references
    let statementYear = null
    for (const line of textLines) {
      if (!line || typeof line !== "string") continue

      try {
        // Look for year in closing balance line
        const yearMatch = line.match(/(?:NOUVEAU SOLDE|SOLDE FINAL|TOTAL).*(\d{2}\/\d{2}\/(\d{4}))/)
        if (yearMatch && yearMatch[2]) {
          statementYear = yearMatch[2]
          console.log(`Found statement year: ${statementYear}`)
          break
        }

        // Alternative: look for 4-digit year anywhere in the document
        const altYearMatch = line.match(/\b(20\d{2})\b/)
        if (altYearMatch && altYearMatch[1] && !statementYear) {
          statementYear = altYearMatch[1]
          console.log(`Inferred statement year: ${statementYear}`)
        }
      } catch (error) {
        console.warn(`Error processing line for year extraction: ${error.message}`)
      }
    }

    if (!statementYear) {
      statementYear = "2024" // Default fallback
      console.log(`No year found, defaulting to: ${statementYear}`)
    }

    result.metadata.statementYear = statementYear

    // Step 2: Parse all lines
    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i]

      // Skip invalid lines
      if (!line || typeof line !== "string") {
        continue
      }

      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      try {
        // Parse opening balance
        if (trimmedLine.includes("SOLDE DEPART")) {
          console.log(`Processing opening balance: "${trimmedLine}"`)
          const match = trimmedLine.match(/SOLDE\s+DEPART\s+AU\s*:?\s*(\d{2}\/\d{2}\/\d{4})\s*([\d\s,]+)/)
          if (match && match[1] && match[2]) {
            result.openingBalance = {
              type: "opening_balance",
              date: match[1],
              amount: match[2].trim(),
              amountNumeric: this.normalizeAmount(match[2]),
              dateISO: this.normalizeDate(match[1]),
            }
            console.log("✅ Opening balance parsed")
          }
          continue
        }

        // Parse closing balance
        if (trimmedLine.includes("NOUVEAU SOLDE")) {
          console.log(`Processing closing balance: "${trimmedLine}"`)
          const match = trimmedLine.match(/NOUVEAU\s+SOLDE\s+AU\s+(\d{2}\/\d{2}\/\d{4})\s*([\d\s,]+)/)
          if (match && match[1] && match[2]) {
            result.closingBalance = {
              type: "closing_balance",
              date: match[1],
              amount: match[2].trim(),
              amountNumeric: this.normalizeAmount(match[2]),
              dateISO: this.normalizeDate(match[1]),
            }
            console.log("✅ Closing balance parsed")
          }
          continue
        }

        // Parse total movements
        if (trimmedLine.includes("TOTAL DES MOUVEMENTS")) {
          console.log(`Processing total movements: "${trimmedLine}"`)
          const amounts = trimmedLine.match(/(\d+(?:\s+\d{3})*,\d{2})/g)
          if (amounts && Array.isArray(amounts) && amounts.length >= 2) {
            result.totalMovements = {
              type: "total_movements",
              totalDebits: amounts[amounts.length - 2].trim(),
              totalCredits: amounts[amounts.length - 1].trim(),
              totalDebitsNumeric: this.normalizeAmount(amounts[amounts.length - 2]),
              totalCreditsNumeric: this.normalizeAmount(amounts[amounts.length - 1]),
            }
            console.log("✅ Total movements parsed")
          }
          continue
        }

        // Parse CIH transactions - CORRECTED FORMAT
        // Pattern: DD/MM DD/MM DESCRIPTION AMOUNT
        const transactionPattern = /^(\d{2}\/\d{2})\s+(\d{2}\/\d{2})\s+(.+?)\s+([\d\s,]+)$/
        const transactionMatch = trimmedLine.match(transactionPattern)

        if (transactionMatch && transactionMatch.length >= 5) {
          const [, operDate, valueDate, description, amount] = transactionMatch

          console.log(`Processing transaction: ${operDate} ${valueDate} | ${description.substring(0, 40)}...`)

          const isCredit = this.detectCreditTransaction(description)

          const transaction = {
            code: null,
            operationDate: operDate || null,
            valueDate: valueDate || null,
            description: (description || "").trim(),
            amount: (amount || "").trim(),
            amountNumeric: this.normalizeAmountWithSign(amount, isCredit),
            debitCreditType: isCredit ? "credit" : "debit",
            transactionType: this.detectTransactionType(description),
            operationDateISO: this.normalizeDate(operDate, statementYear),
            valueDateISO: this.normalizeDate(valueDate, statementYear),
            isExpense: !isCredit,
            isIncome: isCredit,
            rawLine: line,
          }

          result.transactions.push(transaction)
          result.metadata.parsedTransactions++

          console.log(
            `✅ Transaction parsed: ${(description || "").substring(0, 30)}... | ${isCredit ? "+" : ""}${transaction.amountNumeric}`,
          )
          continue
        }

        // Alternative pattern for simpler CIH format (without value date)
        const simplePattern = /^(\d{2}\/\d{2})\s+(.+?)\s+([\d\s,]+)$/
        const simpleMatch = trimmedLine.match(simplePattern)

        if (simpleMatch && simpleMatch.length >= 4) {
          const [, operDate, description, amount] = simpleMatch

          console.log(`Processing simple transaction: ${operDate} | ${description.substring(0, 40)}...`)

          const isCredit = this.detectCreditTransaction(description)

          const transaction = {
            code: null,
            operationDate: operDate || null,
            valueDate: operDate || null, // Same as operation date
            description: (description || "").trim(),
            amount: (amount || "").trim(),
            amountNumeric: this.normalizeAmountWithSign(amount, isCredit),
            debitCreditType: isCredit ? "credit" : "debit",
            transactionType: this.detectTransactionType(description),
            operationDateISO: this.normalizeDate(operDate, statementYear),
            valueDateISO: this.normalizeDate(operDate, statementYear),
            isExpense: !isCredit,
            isIncome: isCredit,
            rawLine: line,
          }

          result.transactions.push(transaction)
          result.metadata.parsedTransactions++

          console.log(
            `✅ Simple transaction parsed: ${(description || "").substring(0, 30)}... | ${isCredit ? "+" : ""}${transaction.amountNumeric}`,
          )
          continue
        }
      } catch (error) {
        console.error(`Error parsing CIH line ${i + 1}: ${error.message}`)
        if (!result.metadata.failedLines) {
          result.metadata.failedLines = []
        }
        result.metadata.failedLines.push({
          line: line || "",
          lineNumber: i + 1,
          error: error.message,
        })
      }
    }

    console.log(
      `\nCIH parsing complete: ${result.metadata.parsedTransactions} transactions, ${result.metadata.failedLines ? result.metadata.failedLines.length : 0} failed lines`,
    )

    return result
  }

  private static parseAttijariwafaStatement(textLines: string[]): any {
    console.log("Parsing Attijariwafa Bank statement...")

    // Defensive input validation
    if (!textLines || !Array.isArray(textLines)) {
      console.error("parseAttijariwafaStatement: Invalid textLines input")
      return {
        bank: "Attijariwafa",
        openingBalance: null,
        closingBalance: null,
        totalMovements: null,
        transactions: [],
        metadata: {
          totalLines: 0,
          parsedTransactions: 0,
          failedLines: [],
          dateFormat: "DD MM YYYY",
          currency: "MAD",
          error: "Invalid input to parseAttijariwafaStatement",
        },
      }
    }

    const result = {
      bank: "Attijariwafa",
      openingBalance: null,
      closingBalance: null,
      totalMovements: null,
      transactions: [],
      metadata: {
        totalLines: textLines.length,
        parsedTransactions: 0,
        failedLines: [],
        dateFormat: "DD MM YYYY",
        currency: "MAD",
      },
    }

    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i]

      // Skip invalid lines
      if (!line || typeof line !== "string") {
        continue
      }

      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      try {
        // Parse opening balance
        if (trimmedLine.includes("SOLDE DEPART")) {
          const match = trimmedLine.match(
            /SOLDE\s+DEPART\s+AU\s+(\d{2}\s+\d{2}\s+\d{4})\s+([\d\s,]+)(?:\s+(CREDITEUR|DEBITEUR))?/,
          )
          if (match && match[1] && match[2]) {
            const balanceType = match[3] || "CREDITEUR"
            result.openingBalance = {
              type: "opening_balance",
              date: match[1],
              amount: match[2].trim(),
              balanceType: balanceType,
              amountNumeric:
                balanceType === "DEBITEUR" ? -this.normalizeAmount(match[2]) : this.normalizeAmount(match[2]),
              dateISO: this.normalizeDate(match[1]),
            }
            console.log("✅ Opening balance parsed")
          }
          continue
        }

        // Parse closing balance
        if (trimmedLine.includes("SOLDE FINAL")) {
          const match = trimmedLine.match(
            /SOLDE\s+FINAL\s+AU\s+(\d{2}\s+\d{2}\s+\d{4})\s+([\d\s,]+)\s+(CREDITEUR|DEBITEUR)/,
          )
          if (match && match[1] && match[2] && match[3]) {
            result.closingBalance = {
              type: "closing_balance",
              date: match[1],
              amount: match[2].trim(),
              balanceType: match[3],
              amountNumeric: match[3] === "DEBITEUR" ? -this.normalizeAmount(match[2]) : this.normalizeAmount(match[2]),
              dateISO: this.normalizeDate(match[1]),
            }
            console.log("✅ Closing balance parsed")
          }
          continue
        }

        // Parse total movements
        if (trimmedLine.includes("TOTAL MOUVEMENTS")) {
          const amounts = trimmedLine.match(/(\d+(?:\s+\d{3})*,\d{2})/g)
          if (amounts && Array.isArray(amounts) && amounts.length >= 2) {
            result.totalMovements = {
              type: "total_movements",
              totalDebits: amounts[amounts.length - 2].trim(),
              totalCredits: amounts[amounts.length - 1].trim(),
              totalDebitsNumeric: this.normalizeAmount(amounts[amounts.length - 2]),
              totalCreditsNumeric: this.normalizeAmount(amounts[amounts.length - 1]),
            }
            console.log("✅ Total movements parsed")
          }
          continue
        }

        // Parse AWB transactions - ENHANCED FORMAT
        const transactionMatch = trimmedLine.match(/^(0\d{3}[A-Z0-9]{2})\s+(\d{2})\s+(\d{2})\s+(.+)$/)
        if (transactionMatch && transactionMatch.length >= 5) {
          const [, code, day1, day2, remainder] = transactionMatch

          console.log(`Processing AWB transaction: ${code} ${day1} ${day2} | ${remainder.substring(0, 40)}...`)

          // Extract amount from end of remainder
          const amountMatch = remainder.match(/(\d+(?:\s+\d{3})*,\d{2})$/)
          if (amountMatch && amountMatch[1]) {
            const amount = amountMatch[1]
            let description = remainder.replace(/\s*\d+(?:\s+\d{3})*,\d{2}$/, "").trim()

            // Extract date from description if present
            let valueDate = null
            const dateInDescMatch = description.match(/(\d{2}\s+\d{2}\s+\d{4})/)
            if (dateInDescMatch && dateInDescMatch[1]) {
              valueDate = dateInDescMatch[1]
              // Remove the date from description to clean it up
              description = description.replace(/\s*\d{2}\s+\d{2}\s+\d{4}\s*/, " ").trim()
            } else {
              // Use processing date as value date if no specific date found
              valueDate = `${day1} ${day2} 2024` // Default year
            }

            const isCredit = this.detectCreditTransaction(description)

            const transaction = {
              code: code || null,
              processingDate: `${day1} ${day2}`,
              operationDate: `${day1}/${day2}`,
              valueDate: valueDate || null,
              description: description || "",
              amount: amount || "",
              amountNumeric: this.normalizeAmountWithSign(amount, isCredit),
              debitCreditType: isCredit ? "credit" : "debit",
              transactionType: this.detectTransactionType(description),
              operationDateISO: this.normalizeDate(`${day1}/${day2}/2024`),
              valueDateISO: this.normalizeDate(valueDate),
              isExpense: !isCredit,
              isIncome: isCredit,
              rawLine: line,
            }

            result.transactions.push(transaction)
            result.metadata.parsedTransactions++

            console.log(
              `✅ AWB transaction parsed: ${(description || "").substring(0, 30)}... | ${isCredit ? "+" : ""}${transaction.amountNumeric}`,
            )
          }
        }
      } catch (error) {
        console.error(`Error parsing AWB line ${i + 1}: ${error.message}`)
        if (!result.metadata.failedLines) {
          result.metadata.failedLines = []
        }
        result.metadata.failedLines.push({
          line: line || "",
          lineNumber: i + 1,
          error: error.message,
        })
      }
    }

    return result
  }

  private static normalizeAmount(amountStr: string): number {
    if (!amountStr || typeof amountStr !== "string") {
      return 0
    }

    try {
      const cleaned = amountStr.replace(/\s+/g, "").replace(",", ".")
      const parsed = Number.parseFloat(cleaned)
      return isNaN(parsed) ? 0 : parsed
    } catch (error) {
      console.error("Error normalizing amount:", error.message)
      return 0
    }
  }

  private static normalizeAmountWithSign(amountStr: string, isCredit: boolean): number {
    const amount = this.normalizeAmount(amountStr)
    // FIXED: Expenses are negative, incomes are positive
    return isCredit ? Math.abs(amount) : -Math.abs(amount)
  }

  private static normalizeDate(dateStr: string, year: string | null = null): string {
    if (!dateStr || typeof dateStr !== "string") {
      return null
    }

    try {
      const cleaned = dateStr.trim()

      if (cleaned.includes("/")) {
        // CIH format: DD/MM
        const parts = cleaned.split("/")
        if (parts.length < 2) return null

        const day = parts[0] ? parts[0].padStart(2, "0") : "01"
        const month = parts[1] ? parts[1].padStart(2, "0") : "01"
        const yearPart = parts[2] || year || "2024" // Use provided year or default

        return `${yearPart}-${month}-${day}`
      } else {
        // AWB format: DD MM YYYY or space-separated
        const parts = cleaned.split(/\s+/)
        if (parts.length < 2) return null

        const day = parts[0] ? parts[0].padStart(2, "0") : "01"
        const month = parts[1] ? parts[1].padStart(2, "0") : "01"
        let yearPart = parts[2] || year || "2024"

        if (yearPart && yearPart.length === 2) {
          yearPart = "20" + yearPart
        }

        return `${yearPart}-${month}-${day}`
      }
    } catch (error) {
      console.error("Error normalizing date:", error.message)
      return null
    }
  }

  private static detectTransactionType(description: string): string {
    if (!description || typeof description !== "string") {
      return "other"
    }

    const desc = description.toLowerCase()

    const patterns = {
      atm: /retrait|gab|atm|withdrawal/i,
      card: /carte|card|paiement|payment/i,
      online: /internet|online|web|paypal/i,
      transfer_out: /virement.*emis|transfer.*out|envoi/i,
      transfer_in: /virement.*recu|versement|transfer.*in|recu/i,
      fees: /frais|fee|commission|droit.*timbre/i,
      recharge: /recharge|rechargement/i,
    }

    // Defensive check to ensure patterns object exists
    if (!patterns || typeof patterns !== "object") {
      console.error("Transaction type patterns not properly defined")
      return "other"
    }

    try {
      for (const [type, pattern] of Object.entries(patterns)) {
        if (pattern && pattern.test && pattern.test(desc)) {
          return type
        }
      }
    } catch (error) {
      console.error("Error in detectTransactionType:", error.message)
      return "other"
    }

    return "other"
  }

  private static detectCreditTransaction(description: string): boolean {
    if (!description || typeof description !== "string") {
      return false
    }

    const desc = description.toLowerCase()

    const creditKeywords = [
      "versement",
      "virement recu",
      "recu",
      "credit",
      "depot",
      "salaire",
      "pension",
      "allocation",
      "dividend",
      "interet",
      "remboursement",
      "refund",
      "cashback",
      "bonus",
    ]

    // Defensive check to ensure creditKeywords is an array
    if (!Array.isArray(creditKeywords)) {
      console.error("creditKeywords is not an array")
      return false
    }

    return creditKeywords.some((keyword) => {
      return typeof keyword === "string" && desc.includes(keyword)
    })
  }

  private static assignCategory(description: string, type: "expense" | "income"): string {
    if (!description || typeof description !== "string") {
      return "Uncategorized"
    }

    // Defensive check for DefaultCategories
    if (!DefaultCategories || !Array.isArray(DefaultCategories)) {
      console.error("DefaultCategories is not properly defined")
      return "Uncategorized"
    }

    try {
      // Filter categories by type and find matches
      const categories = DefaultCategories.filter((cat) => {
        return cat && typeof cat === "object" && cat.type === type
      })

      // Defensive check for categories array
      if (!Array.isArray(categories) || categories.length === 0) {
        console.warn(`No categories found for type: ${type}`)
        return "Uncategorized"
      }

      for (const category of categories) {
        // Defensive check for category structure
        if (!category || typeof category !== "object" || !category.keywords || !Array.isArray(category.keywords)) {
          console.warn("Invalid category structure:", category)
          continue
        }

        try {
          const hasMatch = category.keywords.some((keyword) => {
            return keyword && typeof keyword === "string" && description.toLowerCase().includes(keyword.toLowerCase())
          })

          if (hasMatch) {
            return category.name || "Uncategorized"
          }
        } catch (error) {
          console.error("Error checking category keywords:", error.message)
          continue
        }
      }
    } catch (error) {
      console.error("Error in assignCategory:", error.message)
    }

    return "Uncategorized"
  }

  private static async extractTextFromPDF(pdf: any, maxPages: number): Promise<string[]> {
    const allLines: string[] = []

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      console.log(`[v0] Processing page ${pageNum}/${maxPages}...`)

      try {
        const page = await this.withTimeout(pdf.getPage(pageNum), 3000)
        const textContent = await this.withTimeout(page.getTextContent(), 3000)

        console.log(`[v0] Page ${pageNum}: Found ${textContent.items?.length || 0} text items`)

        const pageLines = this.reconstructLinesFromTextItems(textContent.items || [])
        allLines.push(...pageLines)

        console.log(`[v0] Page ${pageNum}: Extracted ${pageLines.length} lines`)

        if (page.cleanup) {
          page.cleanup()
        }
      } catch (error) {
        console.error(`[v0] Error processing page ${pageNum}:`, error)
        console.error(`[v0] Page ${pageNum} error details:`, error.message)
        continue
      }
    }

    console.log(`[v0] Total lines extracted from all pages: ${allLines.length}`)
    return allLines
  }

  private static reconstructLinesFromTextItems(textItems: any[]): string[] {
    const lines: { y: number; text: string }[] = []

    textItems.forEach((item) => {
      if (!item.str?.trim()) return

      const y = Math.round(item.transform[5] || 0)
      const existingLine = lines.find((line) => Math.abs(line.y - y) < 2)

      if (existingLine) {
        existingLine.text += " " + item.str.trim()
      } else {
        lines.push({ y, text: item.str.trim() })
      }
    })

    // Sort by Y coordinate (top to bottom) and return text
    return lines
      .sort((a, b) => b.y - a.y)
      .map((line) => line.text.trim())
      .filter((line) => line.length > 0)
  }
}
