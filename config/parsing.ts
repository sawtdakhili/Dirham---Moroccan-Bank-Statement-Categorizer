export const AttijariwafaParsingConfig = {
  bankIdentifiers: ["SOLDE DEPART AU", "SOLDE FINAL AU", "CREDITEUR", "DEBITEUR"],

  transactionPatterns: [
    // Main transaction pattern based on actual bank statement format
    // Format: CODE MONTH DESCRIPTION DATE AMOUNT
    // Format: 0016BK01 07 VIR.EMIS WEB VERS Smart Stooners   28 06 2024           1 200,00
    {
      regex: /^(\d{4}[A-Z]{2}\d{2})\s+(\d{2})\s+(.+?)\s+(\d{2}\s+\d{2}\s+\d{4})\s+([\d\s,.-]+)$/gm,
      groups: {
        code: 1,
        month: 2,
        description: 3,
        valueDate: 4,
        amount: 5,
      },
    },
    // Alternative pattern for simpler transactions
    {
      regex: /^(\d{4}[A-Z]{2}\d{2})\s+(\d{2})\s+(.+?)\s+([\d\s,.-]+)$/gm,
      groups: {
        code: 1,
        month: 2,
        description: 3,
        amount: 4,
      },
    },
    {
      regex: /(\d{4}[A-Z]{2}\d{2})\s+\d{2}\s+(.+?)\s+(\d{1,2}\s+\d{1,2}\s+\d{4})\s+([\d\s,.-]+)/g,
      groups: {
        code: 1,
        description: 2,
        valueDate: 3,
        amount: 4,
      },
    },
    // Very basic pattern to catch any transaction-like line
    {
      regex: /(\d{4}[A-Z]{2}\d{2}).*?(\d{1,2}\s+\d{1,2}\s+\d{4}).*?([\d\s,.-]+)/g,
      groups: {
        code: 1,
        valueDate: 2,
        amount: 3,
      },
    },
  ],

  balancePatterns: {
    startBalance: /SOLDE\s+DEPART\s+AU\s+(\d{2}\s+\d{2}\s+\d{4})\s+([\d\s,.-]+)\s+(CREDITEUR|DEBITEUR)/,
    endBalance: /SOLDE\s+FINAL\s+AU\s+(\d{2}\s+\d{2}\s+\d{4})\s+([\d\s,.-]+)\s+(CREDITEUR|DEBITEUR)/,
  },

  tablePattern: {
    // For structured table format
    headerRow: /CODE.*DATE.*LIBELLE.*VALEUR.*DEBIT.*CREDIT/,
    dataRow: /^(\d{4}\w{2})\s+(\d{2}\s+\d{2})\s+(.+?)\s+(\d{2}\s+\d{2}\s+\d{4})\s+([\d\s,.-]*)\s+([\d\s,.-]*)$/gm,
    groups: {
      code: 1,
      date: 2,
      description: 3,
      valueDate: 4,
      debit: 5,
      credit: 6,
    },
  },

  dateFormats: ["DD MM YYYY", "DD/MM/YYYY"],

  amountFormat: {
    thousandsSeparator: " ",
    decimalSeparator: ",",
    debitIsNegative: true,
    creditIsPositive: true,
  },

  ignoredLines: [
    /^SOLDE\s+DEPART\s+AU/,
    /^SOLDE\s+FINAL\s+AU/,
    /^TOTAL\s+MOUVEMENTS/,
    /^_+/,
    /^\s*$/,
    /^CODE\s+DATE\s+LIBELLE/,
    /^\s*\d+\s*$/, // Page numbers
    /^.*CREDITEUR\s*$/,
    /^.*DEBITEUR\s*$/,
  ],
}

export const DefaultCategories = [
  // Expense Categories
  { id: "food", name: "Food & Restaurants", type: "expense" as const, icon: "🍽️", color: "#FF6B6B" },
  { id: "shopping", name: "Shopping & Retail", type: "expense" as const, icon: "🛒", color: "#4ECDC4" },
  { id: "transport", name: "Transportation", type: "expense" as const, icon: "🚗", color: "#45B7D1" },
  { id: "utilities", name: "Utilities & Bills", type: "expense" as const, icon: "⚡", color: "#96CEB4" },
  { id: "healthcare", name: "Healthcare", type: "expense" as const, icon: "🏥", color: "#FECA57" },
  { id: "entertainment", name: "Entertainment", type: "expense" as const, icon: "🎬", color: "#FF9FF3" },
  { id: "housing", name: "Housing", type: "expense" as const, icon: "🏠", color: "#54A0FF" },
  { id: "personal-care", name: "Personal Care", type: "expense" as const, icon: "💅", color: "#5F27CD" },
  { id: "education", name: "Education", type: "expense" as const, icon: "📚", color: "#00D2D3" },
  { id: "insurance", name: "Insurance", type: "expense" as const, icon: "🛡️", color: "#FF9F43" },
  { id: "other-expense", name: "Other Expenses", type: "expense" as const, icon: "💳", color: "#74B9FF" },

  // Income Categories
  { id: "salary", name: "Salary", type: "income" as const, icon: "💰", color: "#00B894" },
  { id: "freelance", name: "Freelance Work", type: "income" as const, icon: "💼", color: "#00CEC9" },
  { id: "investments", name: "Investments", type: "income" as const, icon: "📈", color: "#6C5CE7" },
  { id: "business", name: "Business Income", type: "income" as const, icon: "🏢", color: "#A29BFE" },
  { id: "other-income", name: "Other Income", type: "income" as const, icon: "💵", color: "#FD79A8" },
]
