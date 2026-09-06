import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitStatus {
  providerName: string;
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureTime: number | null;
  totalCalls: number;
  totalFailures: number;
}

/**
 * Robust Circuit Breaker for external provider integrations.
 * Protects system reliability by failing fast when external providers degrade,
 * preventing cascade latency and budget leakage.
 */
@Injectable()
export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);

  private readonly failureThreshold = 3; // Trip after 3 consecutive failures
  private readonly cooldownPeriodMs = 30000; // 30s half-open cooldown

  private readonly circuits = new Map<
    string,
    {
      state: CircuitState;
      consecutiveFailures: number;
      lastFailureTime: number | null;
      totalCalls: number;
      totalFailures: number;
    }
  >();

  private getOrCreateCircuit(providerName: string) {
    let circuit = this.circuits.get(providerName);
    if (!circuit) {
      circuit = {
        state: "CLOSED",
        consecutiveFailures: 0,
        lastFailureTime: null,
        totalCalls: 0,
        totalFailures: 0,
      };
      this.circuits.set(providerName, circuit);
    }
    return circuit;
  }

  /**
   * Evaluates circuit state before executing a provider call.
   */
  async execute<T>(providerName: string, action: () => Promise<T>): Promise<T> {
    const circuit = this.getOrCreateCircuit(providerName);
    circuit.totalCalls++;

    // Check if open circuit has cooled down into half-open
    if (circuit.state === "OPEN") {
      const now = Date.now();
      if (
        circuit.lastFailureTime &&
        now - circuit.lastFailureTime >= this.cooldownPeriodMs
      ) {
        circuit.state = "HALF_OPEN";
        this.logger.log(
          `Circuit breaker for [${providerName}] entered HALF_OPEN state; allowing probe.`,
        );
      } else {
        throw new ServiceUnavailableException(
          `Circuit breaker for provider [${providerName}] is OPEN. Requests blocked to prevent cascading failure.`,
        );
      }
    }

    try {
      const result = await action();

      // On successful execution in HALF_OPEN, close the circuit
      if (circuit.state === "HALF_OPEN") {
        circuit.state = "CLOSED";
        circuit.consecutiveFailures = 0;
        this.logger.log(
          `Circuit breaker for [${providerName}] probe succeeded. Circuit reset to CLOSED.`,
        );
      } else {
        circuit.consecutiveFailures = 0;
      }

      return result;
    } catch (err: unknown) {
      circuit.consecutiveFailures++;
      circuit.totalFailures++;
      circuit.lastFailureTime = Date.now();

      if (
        circuit.state === "HALF_OPEN" ||
        circuit.consecutiveFailures >= this.failureThreshold
      ) {
        circuit.state = "OPEN";
        this.logger.warn(
          `Circuit breaker tripped to OPEN for [${providerName}] after ${circuit.consecutiveFailures} failures.`,
        );
      }

      throw err;
    }
  }

  /**
   * Manually trips the circuit for a provider (e.g. on budget exhaustion or kill-switch).
   */
  trip(providerName: string, reason: string): void {
    const circuit = this.getOrCreateCircuit(providerName);
    circuit.state = "OPEN";
    circuit.lastFailureTime = Date.now();
    this.logger.warn(
      `Circuit breaker manually tripped to OPEN for [${providerName}]: ${reason}`,
    );
  }

  /**
   * Manually resets circuit state to CLOSED.
   */
  reset(providerName: string): void {
    const circuit = this.getOrCreateCircuit(providerName);
    circuit.state = "CLOSED";
    circuit.consecutiveFailures = 0;
    circuit.lastFailureTime = null;
    this.logger.log(
      `Circuit breaker manually reset to CLOSED for [${providerName}].`,
    );
  }

  /**
   * Returns snapshot status for all monitored circuits.
   */
  getStatus(): CircuitStatus[] {
    return Array.from(this.circuits.entries()).map(([providerName, data]) => ({
      providerName,
      state: data.state,
      consecutiveFailures: data.consecutiveFailures,
      lastFailureTime: data.lastFailureTime,
      totalCalls: data.totalCalls,
      totalFailures: data.totalFailures,
    }));
  }
}
