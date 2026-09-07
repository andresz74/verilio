import { resetE2eOwner } from "./global-cleanup.js";

export default function globalSetup(): void {
  resetE2eOwner(true);
}
