export interface SIAControlCommand {
    code: string
    zone?: string
    timestamp: Date
}

export class CommandQueue {
    private queue: SIAControlCommand[] = []

    enqueue(cmd: SIAControlCommand): void {
        this.queue.push(cmd)
    }

    dequeue(): SIAControlCommand | null {
        return this.queue.shift() || null
    }

    isEmpty(): boolean {
        return this.queue.length === 0
    }
}
