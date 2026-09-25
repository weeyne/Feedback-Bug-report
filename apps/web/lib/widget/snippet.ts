/** The widget's script URL on this deployment. */
export function widgetSrc(appUrl: string): string {
  return `${appUrl}/w/widget.js`;
}

/** The one-line HTML install snippet shown on the Install page and on the landing. */
export function installSnippet(appUrl: string, projectKey: string): string {
  return `<script async src="${widgetSrc(appUrl)}" data-project-id="${projectKey}"></script>`;
}
