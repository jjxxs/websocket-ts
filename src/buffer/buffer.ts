/**
 * Temporary container for generic elements.
 */
export interface Buffer<E> {
    /**
     * Length of the buffer, the count of elements
     * that can be read from the buffer.
     * @return the length of the buffer
     */
    len(): number

    /**
     * Capacity of the buffer, the total amount of
     * elements the buffer can contain.
     * @return the capacity of the buffer
     */
    cap(): number

    /**
     * Reads elements from the buffer.
     * @param es array to read into from the buffer
     * @return the count of elements that were read
     */
    read(es: E[]): number

    /**
     * Writes elements to the buffer.
     * @param es array to write to the buffer
     * @return the count of elements that were written
     */
    write(es: E[]): number

    /**
     * Applies a function to every element in the buffer.
     * @param fn the function to apply to every element
     * @return: the count of elements that were used
     */
    forEach(fn: (e: E) => any): number

    /**
     * Clears the buffer. This effectively removes all
     * items in the buffer.
     */
    clear(): void
}
