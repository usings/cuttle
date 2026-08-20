/** D1 holds a value per row comfortably at this size; longer content is split across rows. */
const CHUNK_SIZE = 128 * 1024

/** The rows a value becomes, in the order they must be written and read back. */
export function toChunks(value: string) {
  const output: string[] = []
  let offset = 0
  while (offset < value.length) {
    let end = Math.min(offset + CHUNK_SIZE, value.length)
    // A chunk must not end between the two halves of a surrogate pair: each half encodes on its own
    // as a replacement character, so the emoji would come back out of storage as `\uFFFD\uFFFD`
    // with nothing having failed along the way.
    const last = value.charCodeAt(end - 1)
    if (end < value.length && last >= 0xd8_00 && last <= 0xdb_ff) end -= 1
    output.push(value.slice(offset, end))
    offset = end
  }
  return output.length > 0 ? output : [""]
}

/** The value a set of rows was written from. Rows must already be in `chunk_index` order. */
export function fromChunks(rows: Array<{ content: string }>) {
  return rows.map((row) => row.content).join("")
}
