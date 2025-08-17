import * as pdfjsLib from "pdfjs-dist"

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
      throw new Error(`PDF processing error: ${error.message}`)
    }
  }

  private static async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
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
        type: t.isIncome ? "income" : "expense",
        category: t.transactionType || "other",
      }))
    } catch (error) {
      console.error("[v0] Error in parsePDFInternal:", error)
      throw error
    }
  }

  private static parseBankStatementPDF(textLines: string[]): any {
    console.log("🚀 INTEGRATED DEBUG PARSER - COMPLETE ANALYSIS")
    console.log("=".repeat(60))
    console.log("🎯 Mission: Force ALL transactions to the SAME month from statement period")

    if (!textLines || !Array.isArray(textLines) || textLines.length === 0) {
      throw new Error("Invalid or empty textLines input")
    }

    try {
      // Step 1: Bank detection
      const bankDetection = this.detectBankType(textLines)

      // Step 2: Statement period extraction with debug
      const statementPeriod = this.extractStatementPeriod(textLines)

      // Step 3: Parse transactions with extensive debug
      let transactions = []
      let bank = bankDetection.bank

      if (bankDetection.bank === "cih") {
        transactions = this.parseCIHTransactions(textLines, statementPeriod)
      } else {
        transactions = this.parseAWBTransactions(textLines, statementPeriod)
        bank = "Attijariwafa"
      }

      // Step 4: CRITICAL VALIDATION with detailed analysis
      console.log(`\n🧪 STEP 4: CRITICAL VALIDATION`)
      console.log("=".repeat(50))

      if (transactions.length > 0) {
        const monthAnalysis = {}

        transactions.forEach((txn, index) => {
          const date = new Date(txn.operationDateISO)
          const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}`
          const monthName = this.getMonthName((date.getMonth() + 1).toString().padStart(2, "0"))

          if (!monthAnalysis[monthKey]) {
            monthAnalysis[monthKey] = {
              name: monthName,
              count: 0,
              transactions: [],
            }
          }

          monthAnalysis[monthKey].count++
          monthAnalysis[monthKey].transactions.push({
            index: index + 1,
            description: txn.description?.substring(0, 30) + "...",
            date: txn.operationDateISO,
            debugInfo: txn.debugInfo,
          })
        })

        const uniqueMonths = Object.keys(monthAnalysis)
        console.log(`📊 ANALYSIS RESULTS:`)
        console.log(`   Total transactions: ${transactions.length}`)
        console.log(`   Unique months found: ${uniqueMonths.length}`)
        console.log(`   Expected month: ${this.getMonthName(statementPeriod.month)} ${statementPeriod.year}`)

        console.log(`\n📋 MONTH BREAKDOWN:`)
        Object.entries(monthAnalysis).forEach(([monthKey, data]: [string, any]) => {
          const isExpected = monthKey === `${statementPeriod.year}-${statementPeriod.month}`
          const status = isExpected ? "✅" : "❌"
          console.log(`   ${status} ${data.name} ${monthKey.split("-")[0]}: ${data.count} transactions`)

          if (!isExpected) {
            console.log(`      Sample transactions:`)
            data.transactions.slice(0, 3).forEach((t: any) => {
              console.log(`        ${t.index}. ${t.description} | ${t.date}`)
              if (t.debugInfo) {
                console.log(
                  `           Debug: day=${t.debugInfo.extractedDay}, forced_month=${t.debugInfo.forcedMonth}, result_month=${t.debugInfo.resultMonth}`,
                )
              }
            })
          }
        })

        if (uniqueMonths.length === 1) {
          const expectedKey = `${statementPeriod.year}-${statementPeriod.month}`
          if (uniqueMonths[0] === expectedKey) {
            console.log(
              `\n🎉 SUCCESS: All transactions correctly in ${this.getMonthName(statementPeriod.month)} ${statementPeriod.year}!`,
            )
          } else {
            console.log(
              `\n❌ ERROR: All transactions in ${monthAnalysis[uniqueMonths[0]].name} but expected ${this.getMonthName(statementPeriod.month)} ${statementPeriod.year}`,
            )
            throw new Error(`Date mismatch: got ${uniqueMonths[0]}, expected ${expectedKey}`)
          }
        } else {
          console.log(`\n🚨 BUG CONFIRMED: Transactions scattered across ${uniqueMonths.length} months`)
          console.log(`   Expected: ${this.getMonthName(statementPeriod.month)} ${statementPeriod.year}`)
          console.log(
            `   Found: ${uniqueMonths.map((key) => monthAnalysis[key].name + " " + key.split("-")[0]).join(", ")}`,
          )
          throw new Error(`Consistency violation: transactions in ${uniqueMonths.length} different months`)
        }
      } else {
        console.log(`⚠️ No transactions found`)
      }

      // Build result
      const result = {
        bank: bank,
        transactions: transactions,
        metadata: {
          statementYear: statementPeriod.year,
          statementMonth: statementPeriod.month,
          statementSource: statementPeriod.source,
          parsedTransactions: transactions.length,
          dateFormat: `All forced to ${this.getMonthName(statementPeriod.month)} ${statementPeriod.year}`,
          currency: "MAD",
          parseQuality: transactions.length > 0 ? 100 : 0,
          consistency: "ENFORCED",
        },
      }

      console.log(`\n🏁 FINAL RESULT:`)
      console.log(`   Bank: ${result.bank}`)
      console.log(`   Transactions: ${result.transactions.length}`)
      console.log(`   Period: ${this.getMonthName(result.metadata.statementMonth)} ${result.metadata.statementYear}`)
      console.log(`   Status: ${result.metadata.consistency}`)

      if (result.metadata.parsedTransactions === 0) {
        throw new Error("❌ NO TRANSACTIONS WERE PARSED!")
      }

      return result
    } catch (error) {
      console.error(`❌ PARSING FAILED: ${error.message}`)
      throw error
    }
  }

  private static extractStatementPeriod(textLines: string[]): any {
    console.log("\n📅 STEP 2: STATEMENT PERIOD EXTRACTION")
    console.log("=".repeat(50))

    if (!textLines || !Array.isArray(textLines)) {
      throw new Error("Invalid textLines for statement period extraction")
    }

    const foundPeriods = []

    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i]
      if (!line || typeof line !== "string") continue

      try {
        // AWB CLOSING BALANCE: SOLDE FINAL AU 31 01 2020
        let match = line.match(/SOLDE\s+FINAL\s+AU\s+(\d{2})\s+(\d{2})\s+(\d{4})/)
        if (match) {
          const [fullMatch, day, month, year] = match
          foundPeriods.push({
            source: "AWB_CLOSING",
            priority: 1,
            day,
            month,
            year,
            line: line.trim(),
            lineNumber: i + 1,
          })
          console.log(`✅ Found AWB closing balance (Line ${i + 1}):`)
          console.log(`   Raw line: "${line.trim()}"`)
          console.log(`   Regex match: "${fullMatch}"`)
          console.log(`   Extracted: day="${day}", month="${month}", year="${year}"`)
          console.log(`   Month name: ${this.getMonthName(month)}`)
        }

        // CIH CLOSING BALANCE: NOUVEAU SOLDE AU 31/05/2020
        match = line.match(/NOUVEAU\s+SOLDE\s+AU\s+(\d{2})\/(\d{2})\/(\d{4})/)
        if (match) {
          const [fullMatch, day, month, year] = match
          foundPeriods.push({
            source: "CIH_CLOSING",
            priority: 1,
            day,
            month,
            year,
            line: line.trim(),
            lineNumber: i + 1,
          })
          console.log(`✅ Found CIH closing balance (Line ${i + 1}):`)
          console.log(`   Raw line: "${line.trim()}"`)
          console.log(`   Regex match: "${fullMatch}"`)
          console.log(`   Extracted: day="${day}", month="${month}", year="${year}"`)
          console.log(`   Month name: ${this.getMonthName(month)}`)
        }

        // AWB OPENING BALANCE: SOLDE DEPART AU 31 12 2019
        match = line.match(/SOLDE\s+DEPART\s+AU\s+(\d{2})\s+(\d{2})\s+(\d{4})/)
        if (match) {
          const [fullMatch, day, month, year] = match
          foundPeriods.push({
            source: "AWB_OPENING",
            priority: 2,
            day,
            month,
            year,
            line: line.trim(),
            lineNumber: i + 1,
          })
          console.log(`⚠️ Found AWB opening balance (Line ${i + 1}):`)
          console.log(`   Raw line: "${line.trim()}"`)
          console.log(`   Regex match: "${fullMatch}"`)
          console.log(`   Extracted: day="${day}", month="${month}", year="${year}"`)
          console.log(`   Month name: ${this.getMonthName(month)}`)
        }

        // CIH OPENING BALANCE: SOLDE DEPART AU : 30/04/2020
        match = line.match(/SOLDE\s+DEPART\s+AU\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/)
        if (match) {
          const [fullMatch, day, month, year] = match
          foundPeriods.push({
            source: "CIH_OPENING",
            priority: 2,
            day,
            month,
            year,
            line: line.trim(),
            lineNumber: i + 1,
          })
          console.log(`⚠️ Found CIH opening balance (Line ${i + 1}):`)
          console.log(`   Raw line: "${line.trim()}"`)
          console.log(`   Regex match: "${fullMatch}"`)
          console.log(`   Extracted: day="${day}", month="${month}", year="${year}"`)
          console.log(`   Month name: ${this.getMonthName(month)}`)
        }
      } catch (error) {
        console.warn(`⚠️ Error processing line ${i + 1} for dates: ${error.message}`)
      }
    }

    if (foundPeriods.length === 0) {
      console.error("❌ CRITICAL: No balance lines found!")
      console.log("Lines containing 'SOLDE':")
      textLines.forEach((line, i) => {
        if (line && line.includes("SOLDE")) {
          console.log(`  ${i + 1}: "${line}"`)
        }
      })
      throw new Error("No balance lines found - cannot determine statement period")
    }

    console.log(`\n📊 FOUND ${foundPeriods.length} BALANCE PERIODS:`)
    foundPeriods.forEach((period, index) => {
      console.log(
        `${index + 1}. ${period.source}: ${this.getMonthName(period.month)} ${period.year} (Priority: ${period.priority})`,
      )
    })

    // Sort by priority (closing balance preferred)
    foundPeriods.sort((a, b) => a.priority - b.priority)

    const chosen = foundPeriods[0]

    console.log(`\n🎯 CHOSEN STATEMENT PERIOD:`)
    console.log(`   Source: ${chosen.source}`)
    console.log(`   Month: "${chosen.month}" (${this.getMonthName(chosen.month)})`)
    console.log(`   Year: "${chosen.year}"`)
    console.log(`   Day: "${chosen.day}"`)
    console.log(`   From line ${chosen.lineNumber}: "${chosen.line}"`)
    console.log(`🚨 ALL TRANSACTIONS MUST BE FORCED TO: ${this.getMonthName(chosen.month)} ${chosen.year}`)

    return {
      year: chosen.year,
      month: chosen.month,
      day: chosen.day,
      source: chosen.source,
      allFound: foundPeriods,
    }
  }

  private static parseAWBTransactions(textLines: string[], statementPeriod: any): any[] {
    console.log(`\n📋 STEP 3: AWB TRANSACTION PARSING`)
    console.log("=".repeat(50))
    console.log(`🎯 TARGET: ALL transactions to ${this.getMonthName(statementPeriod.month)} ${statementPeriod.year}`)
    console.log(`   Statement month: "${statementPeriod.month}"`)
    console.log(`   Statement year: "${statementPeriod.year}"`)

    const transactions = []
    let debugCount = 0

    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i]
      if (!line || typeof line !== "string") continue

      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      // Skip balance and total lines
      if (trimmedLine.includes("SOLDE") || trimmedLine.includes("TOTAL")) continue

      try {
        // AWB PATTERN: CODE DD MM DESCRIPTION AMOUNT
        const transactionMatch = trimmedLine.match(/^(0\d{3}[A-Z0-9]{2})\s+(\d{2})\s+(\d{2})\s+(.+)$/)
        if (transactionMatch && transactionMatch.length >= 5) {
          const [fullMatch, code, num1, num2, remainder] = transactionMatch

          debugCount++
          if (debugCount <= 10) {
            console.log(`\n🔍 TRANSACTION ${debugCount} DEBUG (Line ${i + 1}):`)
            console.log(`   Raw line: "${trimmedLine}"`)
            console.log(`   Regex match: "${fullMatch}"`)
            console.log(`   Code: "${code}"`)
            console.log(`   Num1: "${num1}" ← SHOULD BE DAY`)
            console.log(`   Num2: "${num2}" ← SHOULD BE IGNORED`)
            console.log(`   Remainder: "${remainder}"`)
          }

          // Extract amount from end
          const amountMatch = remainder.match(/(\d+(?:\s+\d{3})*,\d{2})$/)
          if (amountMatch) {
            const amount = amountMatch[1]
            let description = remainder.replace(/\s*\d+(?:\s+\d{3})*,\d{2}$/, "").trim()

            if (debugCount <= 10) {
              console.log(`   Amount: "${amount}"`)
              console.log(`   Description (raw): "${description}"`)
            }

            // Validate amount
            const numericAmount = this.normalizeAmount(amount)
            if (numericAmount === 0 || numericAmount > 10000000) {
              if (debugCount <= 10) {
                console.warn(`❌ Skipping invalid amount: ${amount}`)
              }
              continue
            }

            // Clean embedded dates from description
            const originalDesc = description
            description = description.replace(/\d{2}\/\d{2}\/\d{4}/g, "").trim()
            description = description.replace(/\d{2}\/\d{2}\/\d{2}/g, "").trim()
            description = description.replace(/\d{2}\s+\d{2}\s+\d{4}/g, "").trim()
            description = description.replace(/\b20\d{2}\b/g, "").trim()
            description = description.replace(/\s+/g, " ").trim()

            if (debugCount <= 10 && originalDesc !== description) {
              console.log(`   Description (cleaned): "${description}"`)
            }

            const isCredit = this.detectCreditTransaction(description)

            // CRITICAL DATE BUILDING SECTION
            if (debugCount <= 10) {
              console.log(`\n   🔧 CRITICAL DATE BUILDING:`)
            }
            const transactionDay = num1 // Use num1 as day
            if (debugCount <= 10) {
              console.log(`   - Transaction day: "${transactionDay}" (from num1)`)
              console.log(`   - Statement month: "${statementPeriod.month}"`)
              console.log(`   - Statement year: "${statementPeriod.year}"`)
              console.log(
                `   - Calling: buildDateISO("${transactionDay}", "${statementPeriod.month}", "${statementPeriod.year}")`,
              )
            }

            try {
              const finalDateISO = this.buildDateISO(transactionDay, statementPeriod.month, statementPeriod.year)
              if (debugCount <= 10) {
                console.log(`   - Result: "${finalDateISO}"`)

                // Verify the result
                const dateObj = new Date(finalDateISO)
                const resultMonth = dateObj.getMonth() + 1
                const resultYear = dateObj.getFullYear()
                const resultDay = dateObj.getDate()

                console.log(`   - Verification: Day=${resultDay}, Month=${resultMonth}, Year=${resultYear}`)
                console.log(`   - Month name: ${this.getMonthName(resultMonth.toString().padStart(2, "0"))}`)

                const expectedMonth = Number.parseInt(statementPeriod.month)
                const expectedYear = Number.parseInt(statementPeriod.year)

                if (resultMonth === expectedMonth && resultYear === expectedYear) {
                  console.log(`   ✅ SUCCESS: Date is in correct period!`)
                } else {
                  console.log(`   ❌ ERROR: Date is wrong!`)
                  console.log(`      Expected: ${this.getMonthName(statementPeriod.month)} ${statementPeriod.year}`)
                  console.log(`      Got: ${this.getMonthName(resultMonth.toString().padStart(2, "0"))} ${resultYear}`)
                  console.log(`   🚨 THIS IS THE BUG!`)
                }
              }

              const transaction = {
                code: code,
                rawNumbers: `${num1} ${num2}`,
                description: description,
                amount: amount,
                amountNumeric: this.normalizeAmountWithSign(amount, isCredit),
                debitCreditType: isCredit ? "credit" : "debit",
                transactionType: this.detectTransactionType(description),
                operationDateISO: finalDateISO,
                valueDateISO: finalDateISO,
                isExpense: !isCredit,
                isIncome: isCredit,
                rawLine: line,
                debugInfo: {
                  extractedDay: transactionDay,
                  forcedMonth: statementPeriod.month,
                  forcedYear: statementPeriod.year,
                  resultMonth: new Date(finalDateISO).getMonth() + 1,
                  resultYear: new Date(finalDateISO).getFullYear(),
                  lineNumber: i + 1,
                },
              }

              transactions.push(transaction)
              if (debugCount <= 10) {
                console.log(`   ✅ Transaction ${transactions.length} added successfully`)
                console.log("-".repeat(40))
              }
            } catch (dateError) {
              if (debugCount <= 10) {
                console.error(`   ❌ Date building failed: ${dateError.message}`)
              }
            }
          }

          // Limit debug output for readability
          if (debugCount === 10) {
            console.log(`\n⏭️ Processed first 10 transactions for debug, continuing with remaining...`)
          }
        }
      } catch (error) {
        console.error(`❌ Error parsing AWB line ${i + 1}: ${error.message}`)
      }
    }

    console.log(`\n🎯 AWB PARSING COMPLETE: ${transactions.length} transactions`)
    return transactions
  }

  private static parseCIHTransactions(textLines: string[], statementPeriod: any): any[] {
    console.log(`\n🏦 CIH PARSING DEBUG:`)
    console.log(`   Statement period: ${this.getMonthName(statementPeriod.month)} ${statementPeriod.year}`)

    const transactions = []

    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i]
      if (!line || typeof line !== "string") continue

      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      if (trimmedLine.includes("SOLDE") || trimmedLine.includes("TOTAL")) continue

      try {
        let transactionMatch = trimmedLine.match(/^(\d{2})\/\d{2}\s+(\d{2})\/\d{2}\s+(.+?)\s+([\d\s,]+)$/)

        if (!transactionMatch) {
          transactionMatch = trimmedLine.match(/^(\d{2})\/\d{2}\s+(\d{2})\/\d{2}\s+(.+)/)
          if (transactionMatch) {
            const remainder = transactionMatch[3]
            const amountMatch = remainder.match(/([\d\s,]+)$/)
            if (amountMatch) {
              const amount = amountMatch[1].trim()
              const description = remainder.replace(/([\d\s,]+)$/, "").trim()
              transactionMatch = [transactionMatch[0], transactionMatch[1], transactionMatch[2], description, amount]
            }
          }
        }

        if (transactionMatch && transactionMatch.length >= 5) {
          const [, operDay, valueDay, description, amount] = transactionMatch

          console.log(`\n🔍 CIH DEBUG: Line ${i + 1}: operDay="${operDay}", valueDay="${valueDay}"`)
          console.log(`   Forcing to: ${operDay}/${statementPeriod.month}/${statementPeriod.year}`)

          const numericAmount = this.normalizeAmount(amount)
          if (numericAmount === 0 || numericAmount > 10000000) {
            console.warn(`❌ Skipping invalid amount: ${amount}`)
            continue
          }

          const isCredit = this.detectCreditTransaction(description)
          const finalDateISO = this.buildDateISO(operDay, statementPeriod.month, statementPeriod.year)

          const transaction = {
            code: null,
            operationDate: `${operDay}/${statementPeriod.month}`,
            valueDate: `${valueDay}/${statementPeriod.month}`,
            description: description.trim(),
            amount: amount.trim(),
            amountNumeric: this.normalizeAmountWithSign(amount, isCredit),
            debitCreditType: isCredit ? "credit" : "debit",
            transactionType: this.detectTransactionType(description),
            operationDateISO: finalDateISO,
            valueDateISO: this.buildDateISO(valueDay, statementPeriod.month, statementPeriod.year),
            isExpense: !isCredit,
            isIncome: isCredit,
            rawLine: line,
          }

          transactions.push(transaction)
          console.log(`   ✅ CIH transaction: ${finalDateISO} | ${description.substring(0, 30)}...`)
        }
      } catch (error) {
        console.error(`❌ Error parsing CIH line ${i + 1}: ${error.message}`)
      }
    }

    console.log(`\n🎯 CIH: Parsed ${transactions.length} transactions`)
    return transactions
  }

  private static buildDateISO(day: string, month: string, year: string): string {
    console.log(`    🔧 buildDateISO called with: day="${day}", month="${month}", year="${year}"`)

    if (!day || !month || !year) {
      const error = `Invalid date components: day=${day}, month=${month}, year=${year}`
      console.error(`❌ ${error}`)
      throw new Error(error)
    }

    const dayNum = Number.parseInt(day.toString())
    const monthNum = Number.parseInt(month.toString())
    const yearNum = Number.parseInt(year.toString())

    console.log(`    🔧 Parsed to numbers: day=${dayNum}, month=${monthNum}, year=${yearNum}`)

    // Validate ranges
    if (dayNum < 1 || dayNum > 31) {
      const error = `Invalid day: ${dayNum}`
      console.error(`❌ ${error}`)
      throw new Error(error)
    }
    if (monthNum < 1 || monthNum > 12) {
      const error = `Invalid month: ${monthNum}`
      console.error(`❌ ${error}`)
      throw new Error(error)
    }
    if (yearNum < 2000 || yearNum > 2030) {
      const error = `Invalid year: ${yearNum}`
      console.error(`❌ ${error}`)
      throw new Error(error)
    }

    // Check if day is valid for the specific month/year
    const maxDayInMonth = new Date(yearNum, monthNum, 0).getDate()
    if (dayNum > maxDayInMonth) {
      console.warn(
        `⚠️ Day ${dayNum} is invalid for ${this.getMonthName(monthNum.toString().padStart(2, "0"))} ${yearNum}, adjusting to ${maxDayInMonth}`,
      )
      const adjustedDay = maxDayInMonth
      const result = `${yearNum}-${monthNum.toString().padStart(2, "0")}-${adjustedDay.toString().padStart(2, "0")}`
      console.log(`    🔧 buildDateISO result (adjusted): "${result}"`)
      return result
    }

    const result = `${yearNum}-${monthNum.toString().padStart(2, "0")}-${dayNum.toString().padStart(2, "0")}`
    console.log(`    🔧 buildDateISO result: "${result}"`)
    return result
  }

  private static detectBankType(textLines: string[]): any {
    if (!textLines || !Array.isArray(textLines)) {
      return { bank: "unknown", config: null }
    }

    const text = textLines.join(" ").toLowerCase()

    if (text.includes("cih bank") || text.includes("cih.co.ma") || text.includes("mediateur@cih.co.ma")) {
      console.log("✅ Detected CIH Bank")
      return { bank: "cih", config: { dateFormat: "DD/MM with statement period" } }
    }

    if (text.includes("attijariwafa") || text.includes("wafabank")) {
      console.log("✅ Detected Attijariwafa Bank")
      return { bank: "attijariwafa", config: { dateFormat: "DD MM with statement period" } }
    }

    // Pattern-based detection
    const hasCIHPattern = textLines.some((line) => line && /\d{2}\/\d{2}\s+\d{2}\/\d{2}/.test(line.trim()))
    if (hasCIHPattern) {
      console.log("✅ Detected CIH Bank via pattern")
      return { bank: "cih", config: { dateFormat: "DD/MM with statement period" } }
    }

    const hasAWBPattern = textLines.some((line) => line && /^0\d{3}[A-Z0-9]{2}\s+\d{2}\s+\d{2}/.test(line.trim()))
    if (hasAWBPattern) {
      console.log("✅ Detected Attijariwafa Bank via pattern")
      return { bank: "attijariwafa", config: { dateFormat: "DD MM with statement period" } }
    }

    console.log("⚠️ Could not detect bank, defaulting to Attijariwafa")
    return { bank: "attijariwafa", config: { dateFormat: "DD MM with statement period" } }
  }

  private static normalizeAmount(amountStr: string): number {
    if (!amountStr || typeof amountStr !== "string") return 0
    try {
      const cleaned = amountStr
        .replace(/\b20\d{2}\b/g, "")
        .replace(/\s+/g, "")
        .replace(",", ".")
      const parsed = Number.parseFloat(cleaned)
      return isNaN(parsed) ? 0 : parsed
    } catch (error) {
      return 0
    }
  }

  private static normalizeAmountWithSign(amountStr: string, isCredit: boolean): number {
    const amount = this.normalizeAmount(amountStr)
    return isCredit ? Math.abs(amount) : -Math.abs(amount)
  }

  private static detectCreditTransaction(description: string): boolean {
    if (!description || typeof description !== "string") return false
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
    return creditKeywords.some((keyword) => desc.includes(keyword))
  }

  private static detectTransactionType(description: string): string {
    if (!description || typeof description !== "string") return "other"
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
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(desc)) return type
    }
    return "other"
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

  private static getMonthName(monthNum: string): string {
    const months = {
      "01": "January",
      "02": "February",
      "03": "March",
      "04": "April",
      "05": "May",
      "06": "June",
      "07": "July",
      "08": "August",
      "09": "September",
      "10": "October",
      "11": "November",
      "12": "December",
    }
    return months[monthNum] || `Month-${monthNum}`
  }
}
