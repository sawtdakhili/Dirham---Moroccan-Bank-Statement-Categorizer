import type { Transaction, Category, Statement } from "@/types"
import { DefaultCategories } from "@/config/parsing"

export class StorageService {
  private static readonly TRANSACTIONS_KEY = "dirham_transactions"
  private static readonly CATEGORIES_KEY = "dirham_categories"
  private static readonly STATEMENTS_KEY = "dirham_statements"

  static getTransactions(): Transaction[] {
    if (typeof window === "undefined") return []
    const data = localStorage.getItem(this.TRANSACTIONS_KEY)
    if (!data) return []

    return JSON.parse(data).map((t: any) => ({
      ...t,
      date: new Date(t.date),
    }))
  }

  static saveTransactions(transactions: Transaction[]): void {
    if (typeof window === "undefined") return
    localStorage.setItem(this.TRANSACTIONS_KEY, JSON.stringify(transactions))
  }

  static getCategories(): Category[] {
    if (typeof window === "undefined") return DefaultCategories
    const data = localStorage.getItem(this.CATEGORIES_KEY)
    return data ? JSON.parse(data) : DefaultCategories
  }

  static saveCategories(categories: Category[]): void {
    if (typeof window === "undefined") return
    localStorage.setItem(this.CATEGORIES_KEY, JSON.stringify(categories))
  }

  static getStatements(): Statement[] {
    if (typeof window === "undefined") return []
    const data = localStorage.getItem(this.STATEMENTS_KEY)
    if (!data) return []

    return JSON.parse(data).map((s: any) => ({
      ...s,
      uploadDate: new Date(s.uploadDate),
    }))
  }

  static saveStatements(statements: Statement[]): void {
    if (typeof window === "undefined") return
    localStorage.setItem(this.STATEMENTS_KEY, JSON.stringify(statements))
  }

  static addTransaction(transaction: Transaction): void {
    const transactions = this.getTransactions()
    transactions.push(transaction)
    this.saveTransactions(transactions)
  }

  static updateTransaction(id: string, updates: Partial<Transaction>): void {
    const transactions = this.getTransactions()
    const index = transactions.findIndex((t) => t.id === id)
    if (index !== -1) {
      transactions[index] = { ...transactions[index], ...updates }
      this.saveTransactions(transactions)
    }
  }

  static addStatement(statement: Statement): void {
    const statements = this.getStatements()
    statements.push(statement)
    this.saveStatements(statements)
  }

  static clearAllData(): void {
    if (typeof window === "undefined") return
    localStorage.removeItem(this.TRANSACTIONS_KEY)
    localStorage.removeItem(this.STATEMENTS_KEY)
  }

  static isFirstSession(): boolean {
    if (typeof window === "undefined") return true
    return !localStorage.getItem(this.TRANSACTIONS_KEY) && !localStorage.getItem(this.STATEMENTS_KEY)
  }
}
