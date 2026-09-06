// Builds a `SET col = $2, col2 = $3` clause from a flat fields object, mapping
// camelCase API keys to snake_case DB columns via fieldMap and skipping unknown keys.
function buildSetClause(fieldMap, fields, startParamIndex = 2) {
    const setClauses = [];
    const values = [];
    let paramIndex = startParamIndex;

    for (const [apiKey, val] of Object.entries(fields)) {
        const dbKey = fieldMap[apiKey];
        if (dbKey) {
            setClauses.push(`${dbKey} = $${paramIndex}`);
            values.push(val);
            paramIndex++;
        }
    }

    return { setClauses, values, nextParamIndex: paramIndex };
}

module.exports = { buildSetClause };
