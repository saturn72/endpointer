export class InvalidArgumentException extends Error {
    constructor(private paramName:string) {
        super();
    }
}
 