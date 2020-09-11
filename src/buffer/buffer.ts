/**
 * Container for generic elements.
 */
export interface Buffer<E> {
    /**
     * Length of the buffer, e.g. the count of elements
     * currently in the buffer.
     * @return the length of the buffer
     */
    Len(): number

    /**
     * Capacity of the buffer.
     * @return the capacity of the buffer
     */
    Cap(): number

    /**
     * Reads up to es.length elements from the buffer.
     * @param es to read from the buffer
     * @return the count of elements read
     */
    Read(es: E[]): number

    /**
     * Writes up to es.length elements to the buffer.
     * @param es to write to the buffer
     * @return the count of elements written
     */
    Write(es: E[]): number

    /**
     * Applies a function to every element in the buffer.
     * @param fn the function to apply
     * @return: the count of elements handled
     */
    forEach(fn: (e: E) => any): number
}
