export const dynamic = "force-dynamic";

import CallbackClient from "./CallbackClient";

/**
 * Where the console lands after sign-in. The work is entirely client-side --
 * the handoff token is in the URL fragment, which a server never receives --
 * so this segment only hosts the client component.
 */
export default function Page() {
  return <CallbackClient />;
}
