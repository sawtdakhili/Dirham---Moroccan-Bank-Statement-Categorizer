"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Upload, FileText, AlertCircle, CheckCircle } from "lucide-react"
import { PDFParserService } from "@/services/pdf-parser"
import { StorageService } from "@/services/storage"
import type { Transaction, Statement } from "@/types"

interface FileUploadProps {
  onUploadComplete: (transactionCount: number) => void
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)

  const processFile = async (file: File) => {
    setIsProcessing(true)
    setProgress(0)
    setError(null)
    setSuccess(null)
    setDebugInfo(null)

    try {
      if (file.type !== "application/pdf") {
        throw new Error("Please upload a PDF file")
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new Error("File must be smaller than 10MB")
      }

      setProgress(25)

      console.log("Starting PDF parsing for file:", file.name, "Size:", file.size)

      const existingTransactions = StorageService.getTransactions()
      const cleanedExisting = removeDuplicatesFromStorage(existingTransactions)
      if (cleanedExisting.length !== existingTransactions.length) {
        console.log(`[v0] Cleaned up ${existingTransactions.length - cleanedExisting.length} existing duplicates`)
        StorageService.saveTransactions(cleanedExisting)
      }
      console.log("Existing transactions count after cleanup:", cleanedExisting.length)

      const parsedTransactions = await PDFParserService.parsePDF(file)

      console.log("PDF parsing completed. Found transactions:", parsedTransactions.length)
      console.log("Parsed transactions:", parsedTransactions)

      setProgress(50)

      setDebugInfo(`PDF parsing found ${parsedTransactions.length} transactions`)

      if (parsedTransactions.length === 0) {
        console.warn("No transactions found in PDF. This could indicate:")
        console.warn("1. PDF parsing failed")
        console.warn("2. PDF format doesn't match expected bank statement format")
        console.warn("3. PDF contains no transaction data")
        setError(
          "No transactions were found in this PDF. Please check if this is a valid bank statement from a supported bank (Attijariwafa Bank or CIH Bank).",
        )
        setDebugInfo("PDF was processed but no transaction data was extracted. Check console for details.")
        return
      }

      const parseDate = (dateStr: string): Date => {
        if (!dateStr) {
          console.warn(`[v0] Empty date string, using current date`)
          return new Date()
        }

        const yyyyddmmMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
        if (yyyyddmmMatch) {
          const [, year, dayOrMonth, monthOrDay] = yyyyddmmMatch
          const day = Number.parseInt(dayOrMonth)
          const month = Number.parseInt(monthOrDay)

          // If day > 12, it's likely YYYY-DD-MM format, so swap day and month
          if (day > 12) {
            const parsedDate = new Date(Date.UTC(Number.parseInt(year), month - 1, day))
            if (!isNaN(parsedDate.getTime())) {
              console.log(`[v0] Parsed YYYY-DD-MM date: ${dateStr} -> ${parsedDate.toISOString()}`)
              return parsedDate
            }
          }
          // If month > 12, it's likely YYYY-MM-DD format but with invalid month, try swapping
          else if (month > 12) {
            const parsedDate = new Date(Date.UTC(Number.parseInt(year), day - 1, month))
            if (!isNaN(parsedDate.getTime())) {
              console.log(`[v0] Parsed YYYY-MM-DD date (swapped): ${dateStr} -> ${parsedDate.toISOString()}`)
              return parsedDate
            }
          }
          // Try normal YYYY-MM-DD format first
          else {
            let parsedDate = new Date(Date.UTC(Number.parseInt(year), month - 1, day))
            if (!isNaN(parsedDate.getTime())) {
              console.log(`[v0] Parsed YYYY-MM-DD date: ${dateStr} -> ${parsedDate.toISOString()}`)
              return parsedDate
            }
            // If that fails, try YYYY-DD-MM format
            parsedDate = new Date(Date.UTC(Number.parseInt(year), day - 1, month))
            if (!isNaN(parsedDate.getTime())) {
              console.log(`[v0] Parsed YYYY-DD-MM date (fallback): ${dateStr} -> ${parsedDate.toISOString()}`)
              return parsedDate
            }
          }
        }

        // Try to parse the date string directly first
        let parsedDate = new Date(dateStr)
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate
        }

        const ddmmMatch = dateStr.match(/^(\d{1,2})\s+(\d{1,2})$/)
        if (ddmmMatch) {
          const [, day, month] = ddmmMatch
          const currentYear = new Date().getFullYear()
          parsedDate = new Date(Date.UTC(currentYear, Number.parseInt(month) - 1, Number.parseInt(day)))
          if (!isNaN(parsedDate.getTime())) {
            console.log(`[v0] Parsed DD MM date (current year): ${dateStr} -> ${parsedDate.toISOString()}`)
            return parsedDate
          }
        }

        // Try to handle DD MM YYYY format
        const ddmmyyyyMatch = dateStr.match(/(\d{1,2})\s+(\d{1,2})\s+(\d{4})/)
        if (ddmmyyyyMatch) {
          const [, day, month, year] = ddmmyyyyMatch
          parsedDate = new Date(Date.UTC(Number.parseInt(year), Number.parseInt(month) - 1, Number.parseInt(day)))
          if (!isNaN(parsedDate.getTime())) {
            console.log(`[v0] Parsed DD MM YYYY date: ${dateStr} -> ${parsedDate.toISOString()}`)
            return parsedDate
          }
        }

        // Try to handle DD/MM/YYYY format
        const ddmmyyyySlashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
        if (ddmmyyyySlashMatch) {
          const [, day, month, year] = ddmmyyyySlashMatch
          parsedDate = new Date(Date.UTC(Number.parseInt(year), Number.parseInt(month) - 1, Number.parseInt(day)))
          if (!isNaN(parsedDate.getTime())) {
            console.log(`[v0] Parsed DD/MM/YYYY date: ${dateStr} -> ${parsedDate.toISOString()}`)
            return parsedDate
          }
        }

        // Try to handle MM/DD/YYYY format
        const mmddyyyyMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
        if (mmddyyyyMatch) {
          const [, month, day, year] = mmddyyyyMatch
          parsedDate = new Date(Date.UTC(Number.parseInt(year), Number.parseInt(month) - 1, Number.parseInt(day)))
          if (!isNaN(parsedDate.getTime())) {
            console.log(`[v0] Parsed MM/DD/YYYY date: ${dateStr} -> ${parsedDate.toISOString()}`)
            return parsedDate
          }
        }

        // If all parsing attempts fail, log the error and use current date
        console.error(`[v0] Failed to parse date: "${dateStr}", using current date as fallback`)
        return new Date()
      }

      const statementId = `statement_${Date.now()}`
      const transactions: Transaction[] = parsedTransactions.map((pt, index) => {
        console.log(`[v0] Processing transaction ${index}:`)
        console.log(`[v0] - Original amount from parser: "${pt.amount}" (type: ${typeof pt.amount})`)
        console.log(`[v0] - Transaction type: "${pt.type}"`)
        console.log(`[v0] - Description: "${pt.description}"`)
        console.log(`[v0] - Date string: "${pt.date}"`)

        let amount: number
        if (typeof pt.amount === "string") {
          // The PDF parser already sets the correct sign (negative for expenses, positive for income)
          // We need to preserve this sign when converting to number
          const cleanAmountStr = pt.amount.replace(/\s+/g, "").replace(",", ".")
          console.log(`[v0] - Cleaned amount string: "${cleanAmountStr}"`)
          amount = Number.parseFloat(cleanAmountStr)
          console.log(`[v0] - Parsed amount: ${amount}`)
        } else {
          amount = pt.amount
          console.log(`[v0] - Amount was already a number: ${amount}`)
        }

        if (isNaN(amount)) {
          console.warn(`Invalid amount for transaction ${index}:`, pt.amount)
          amount = 0
        }

        if (pt.type === "expense" && amount > 0) {
          console.log(`[v0] - Converting expense amount to negative: ${amount} -> ${-amount}`)
          amount = -amount
        } else if (pt.type === "income" && amount < 0) {
          console.log(`[v0] - Converting income amount to positive: ${amount} -> ${Math.abs(amount)}`)
          amount = Math.abs(amount)
        }

        const transactionDate = parseDate(pt.date)

        console.log(
          `[v0] Final transaction ${index}: ${pt.description} - Amount: ${amount} (${amount < 0 ? "expense" : "income"}) - Type: ${pt.type} - Date: ${transactionDate.toISOString()}`,
        )

        return {
          id: `${statementId}_${index}`,
          date: transactionDate,
          description: pt.description,
          amount: amount, // This now preserves the sign from the PDF parser
          statementId,
        }
      })

      console.log("Converted transactions:", transactions)

      setProgress(75)

      const allTransactions = deduplicateTransactions(cleanedExisting, transactions)
      const uniqueTransactionsAdded = allTransactions.length - cleanedExisting.length

      StorageService.saveTransactions(allTransactions)

      const savedTransactions = StorageService.getTransactions()
      console.log("Total transactions after save:", savedTransactions.length)

      const statement: Statement = {
        id: statementId,
        filename: file.name,
        uploadDate: new Date(),
        transactionCount: uniqueTransactionsAdded,
      }
      StorageService.addStatement(statement)

      setProgress(100)

      if (uniqueTransactionsAdded === 0) {
        setSuccess(`No new transactions found - all ${transactions.length} transactions were already imported`)
        setDebugInfo(`All transactions from this PDF were duplicates of existing transactions`)
      } else {
        setSuccess(`Successfully added ${uniqueTransactionsAdded} new transactions (${savedTransactions.length} total)`)
        setDebugInfo(
          `Added ${uniqueTransactionsAdded} new transactions, ${transactions.length - uniqueTransactionsAdded} duplicates skipped`,
        )
      }

      setTimeout(() => {
        onUploadComplete(uniqueTransactionsAdded)
      }, 1500)
    } catch (error) {
      console.error("PDF processing error:", error)
      setError(error instanceof Error ? error.message : "An error occurred")
      setDebugInfo("PDF processing failed. Check console for detailed error information.")
    } finally {
      setIsProcessing(false)
    }
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      processFile(acceptedFiles[0])
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    disabled: isProcessing,
  })

  const removeDuplicatesFromStorage = (transactions: Transaction[]): Transaction[] => {
    const seen = new Set<string>()
    const unique: Transaction[] = []

    for (const t of transactions) {
      const dateStr =
        t.date instanceof Date ? t.date.toISOString().split("T")[0] : new Date(t.date).toISOString().split("T")[0]
      const key = `${dateStr}_${t.description.trim()}_${Math.abs(t.amount).toFixed(2)}`

      if (!seen.has(key)) {
        seen.add(key)
        unique.push(t)
      } else {
        console.log(`[v0] Removing existing duplicate: ${key}`)
      }
    }

    return unique
  }

  const deduplicateTransactions = (existing: Transaction[], newTxns: Transaction[]): Transaction[] => {
    const existingSet = new Set(
      existing.map((t) => {
        // Ensure date is properly formatted for comparison
        const dateStr =
          t.date instanceof Date ? t.date.toISOString().split("T")[0] : new Date(t.date).toISOString().split("T")[0]
        return `${dateStr}_${t.description.trim()}_${Math.abs(t.amount).toFixed(2)}`
      }),
    )

    const uniqueNewTxns = newTxns.filter((t) => {
      const dateStr =
        t.date instanceof Date ? t.date.toISOString().split("T")[0] : new Date(t.date).toISOString().split("T")[0]
      const key = `${dateStr}_${t.description.trim()}_${Math.abs(t.amount).toFixed(2)}`
      const isDuplicate = existingSet.has(key)

      if (isDuplicate) {
        console.log(`[v0] Duplicate found: ${key}`)
      } else {
        console.log(`[v0] Unique transaction: ${key}`)
      }

      return !isDuplicate
    })

    console.log(
      `[v0] Deduplication: ${newTxns.length} new transactions, ${uniqueNewTxns.length} unique, ${newTxns.length - uniqueNewTxns.length} duplicates removed`,
    )

    return [...existing, ...uniqueNewTxns]
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-primary">DIRHAM</h1>
        <p className="text-muted-foreground">Upload your bank statement to track your expenses</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"}
              ${isProcessing ? "cursor-not-allowed opacity-50" : "hover:border-primary hover:bg-primary/5"}
            `}
          >
            <input {...getInputProps()} />

            <div className="space-y-4">
              {isProcessing ? (
                <FileText className="h-12 w-12 mx-auto text-primary animate-pulse" />
              ) : (
                <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
              )}

              <div>
                {isProcessing ? (
                  <p className="text-lg font-medium">Processing your statement...</p>
                ) : isDragActive ? (
                  <p className="text-lg font-medium">Drop your PDF here</p>
                ) : (
                  <>
                    <p className="text-lg font-medium">Drag & drop your PDF statement here</p>
                    <p className="text-sm text-muted-foreground">or click to browse files</p>
                  </>
                )}
              </div>

              {!isProcessing && (
                <Button variant="outline" size="sm">
                  Choose File
                </Button>
              )}
            </div>
          </div>

          {isProcessing && (
            <div className="mt-4 space-y-2">
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-center text-muted-foreground">
                {progress < 25 && "Validating file..."}
                {progress >= 25 && progress < 50 && "Reading PDF content..."}
                {progress >= 50 && progress < 75 && "Extracting transactions..."}
                {progress >= 75 && progress < 100 && "Saving data..."}
                {progress === 100 && "Complete!"}
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mt-4 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          {debugInfo && (
            <Alert className="mt-4 border-blue-200 bg-blue-50">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">{debugInfo}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="text-center text-sm text-muted-foreground">
        <p>Supported: Attijariwafa Bank & CIH Bank PDF statements • Max size: 10MB</p>
      </div>
    </div>
  )
}
