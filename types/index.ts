export interface Transaction {
  id: string
  date: Date
  description: string
  amount: number // negative for expenses, positive for income
  categoryId?: string
  statementId: string
}

export interface Category {
  id: string
  name: string
  type: "expense" | "income"
  icon: string
  color: string
}

export interface Statement {
  id: string
  filename: string
  uploadDate: Date
  transactionCount: number
}

export interface ParsedTransaction {
  code?: string
  date: string
  description: string
  amount: string
  valueDate?: string
  type?: "income" | "expense"
}
