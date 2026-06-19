# Google Apps Script hardening

The React app can ignore duplicate transaction IDs, but the Google Apps Script
must prevent duplicate rows and serialize balance updates to be safe across
multiple devices.

## Idempotent transaction insert

Wrap the existing `action === "add"` handler with a script lock and return the
existing row when the transaction ID is already present.

```js
function addTransactionIdempotently(sheet, transaction) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var lastRow = sheet.getLastRow();
    var ids = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().flat()
      : [];

    if (ids.indexOf(transaction.id) !== -1) {
      return { success: true, action: "add", duplicate: true, id: transaction.id };
    }

    sheet.appendRow([
      transaction.id,
      transaction.date,
      transaction.notes,
      transaction.category,
      transaction.nominal,
      transaction.ambil,
      transaction.sof
    ]);

    return { success: true, action: "add", id: transaction.id };
  } finally {
    lock.releaseLock();
  }
}
```

Adjust the ID column and appended column order to match the deployed sheet.

## Atomic balance adjustment

Do not let clients calculate and submit a new absolute balance. Add an
`adjustAccountBalance` action that accepts an account ID and signed delta.

```js
function adjustAccountBalance(accountsSheet, accountId, delta) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var values = accountsSheet.getDataRange().getValues();

    for (var row = 1; row < values.length; row += 1) {
      if (String(values[row][0]) !== String(accountId)) continue;

      var balanceCell = accountsSheet.getRange(row + 1, 4);
      var nextBalance = Number(balanceCell.getValue() || 0) + Number(delta || 0);
      balanceCell.setValue(nextBalance);

      return { success: true, balance: nextBalance };
    }

    return { success: false, error: "Account not found." };
  } finally {
    lock.releaseLock();
  }
}
```

After deploying this action, update the React service to send signed deltas
instead of absolute balances for transaction add, update, and delete.
