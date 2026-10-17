function parseGitStatus(output, prefix = '') {
  const fields = output.split('\0');
  const changes = [];
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    if (!field) continue;
    const change = { index: field[0], working: field[1], path: prefix + field.slice(3) };
    // Porcelain -z emits destination first, then the original name separately.
    if (/[RC]/.test(field.slice(0, 2))) change.originalPath = prefix + fields[++index];
    changes.push(change);
  }
  return changes;
}
module.exports = { parseGitStatus };
