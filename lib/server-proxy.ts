import "server-only";
import { ProxyAgent, setGlobalDispatcher } from "undici";

let configured = false;

const configureProxy = () => {
  if (configured) {
    return;
  }

  const proxyUrl =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy ??
    process.env.ALL_PROXY ??
    process.env.all_proxy;

  if (!proxyUrl) {
    configured = true;
    return;
  }

  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  } catch (error) {
    console.warn("Failed to configure global proxy dispatcher", error);
  } finally {
    configured = true;
  }
};

configureProxy();
