import { resetE2eOwner } from "./global-cleanup.js";

export default function globalTeardown(): void {
  resetE2eOwner(false);
}
