export const createEmptyArray = (len: number): Array<number> => {
    return new Array<number>(len);
}

export const createSequentialArray = (len: number): Array<number> => {
    const arr = new Array<number>(len);
    for (let i = 0; i < arr.length; i++)
        arr[i] = i;
    return arr;
}
