﻿﻿using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Hosting;
using System.Web.UI;
using Telerik.Sitefinity.Configuration;
using Telerik.Sitefinity.Frontend.Mvc.Infrastructure;
using Telerik.Sitefinity.Frontend.Mvc.StringResources;
using Telerik.Sitefinity.Localization;
using Telerik.Sitefinity.Modules.Newsletters;
using Telerik.Sitefinity.Services;
using Telerik.Sitefinity.Utilities.HtmlParsing;
using Telerik.Sitefinity.Utilities.TypeConverters;
using Telerik.Sitefinity.Web;
using Telerik.Sitefinity.Web.Configuration;
using Telerik.Sitefinity.Web.UI;

namespace Telerik.Sitefinity.Frontend.GridSystem
{
    /// <summary>
    /// The LayoutControl comprises the basic building block of Sitefinity layouts. GridControl adds the ability to use pure HTML templates.
    /// </summary>
    [RequiresEmbeddedWebResource("Telerik.Sitefinity.Resources.Themes.LayoutsBasics.css", "Telerik.Sitefinity.Resources.Reference")]
    public class GridControl : LayoutControl
    {
        /// <summary>
        /// Gets the template based on the Layout property that will be instantiated inside the control.
        /// </summary>
        protected override ITemplate GetTemplate()
        {
            if (SystemManager.GetModule("Feather") == null)
            {
                var markup = this.ProcessLayoutString(Res.Get<GridDesignerResources>().GridDoesNotWork, ensureSfColsWrapper: true);
                return ControlUtilities.GetTemplate(null, markup.GetHashCode().ToString(CultureInfo.InvariantCulture), null, markup);
            }

            var layout = this.Layout;
            bool isVirtualPath = layout.StartsWith("~/", StringComparison.Ordinal);
            bool isHtmlTemplate = layout.EndsWith(".html", StringComparison.OrdinalIgnoreCase) || layout.EndsWith(".htm", StringComparison.Ordinal);
            ITemplate template = this.GetTemplate(isVirtualPath, isHtmlTemplate, layout);
            return template;
        }

        /// <summary>
        /// Makes sure that the system containers are runat="server" so the layout declaration can be used as a proper container.
        /// </summary>
        /// <param name="targetTemplate">The template.</param>
        /// <param name="ensureSfColsWrapper">if set to <c>true</c> ensures sf_cols containers exists in the template.</param>
        protected virtual string ProcessLayoutString(string targetTemplate, bool ensureSfColsWrapper)
        {
            using (var parser = new HtmlParser(targetTemplate))
            {
                parser.SetChunkHashMode(false);
                parser.AutoExtractBetweenTagsOnly = false;
                parser.CompressWhiteSpaceBeforeTag = false;
                parser.KeepRawHTML = true;
                var output = new StringBuilder();
                HtmlChunk chunk;
                while ((chunk = parser.ParseNext()) != null)
                {
                    var modified = false;
                    if (chunk.Type == HtmlChunkType.OpenTag)
                    {
                        var cssClass = this.GetAttributeValue(chunk, "class");
                        if (cssClass != null)
                        {
                            var classes = cssClass.Split(new char[] { ' ' });
                            if (classes.Contains("sf_cols", StringComparer.Ordinal) ||
                                classes.Contains("sf_colsIn", StringComparer.Ordinal) ||
                                classes.Contains("sf_colsOut", StringComparer.Ordinal))
                            {
                                chunk.SetAttribute("runat", "server");
                                modified = true;
                            }
                        }
                    }

                    output.Append(modified ? chunk.GenerateHtml() : chunk.Html);
                }

                if (ensureSfColsWrapper)
                {
                    return "<div runat=\"server\" class=\"sf_cols\">" + output.ToString() + "</div>";
                }

                return output.ToString();
            }
        }

        /// <summary>
        /// Gets the template.
        /// </summary>
        /// <param name="isVirtualPath">The is virtual path.</param>
        /// <param name="isHtmlTemplate">The is HTML template.</param>
        /// <param name="layout">The layout.</param>
        /// <returns></returns>
        protected virtual ITemplate GetTemplate(bool isVirtualPath, bool isHtmlTemplate, string layout)
        {
            if (isVirtualPath && isHtmlTemplate)
            {
                if (!HostingEnvironment.VirtualPathProvider.FileExists(layout))
                {
                    throw new ArgumentException(Res.Get<InfrastructureResources>("CannotFindTemplateMvcForm", layout));
                }

                using (var reader = new StreamReader(HostingEnvironment.VirtualPathProvider.GetFile(layout).Open()))
                {
                    layout = reader.ReadToEnd();
                }
            }
            else if (isVirtualPath)
            {
                return ControlUtilities.GetTemplate(layout, null, null, null);
            }
            else if (layout != null && layout.EndsWith(".ascx", StringComparison.Ordinal))
            {
                Type assemblyInfo;

                if (string.IsNullOrEmpty(this.AssemblyInfo))
                    assemblyInfo = Config.Get<ControlsConfig>().ResourcesAssemblyInfo;
                else
                    assemblyInfo = TypeResolutionService.ResolveType(this.AssemblyInfo, true);

                return ControlUtilities.GetTemplate(null, layout, assemblyInfo, null);
            }

            // Add sf_cols wrapper for back end pages and email campaigns.
            var currentNode = SiteMapBase.GetActualCurrentNode();
            var rootNode = currentNode != null ? currentNode.RootNode as PageSiteNode : null;
            var ensureSfColsWrapper = (this.IsBackend() && !SystemManager.IsPreviewMode) 
                                    || rootNode == null 
                                    || rootNode.Id == NewslettersModule.standardCampaignRootNodeId 
                                    || System.Web.HttpContext.Current.Items[SiteMapBase.CurrentNodeKey] == null;
            layout = this.ProcessLayoutString(layout, ensureSfColsWrapper);

            return ControlUtilities.GetTemplate(null, layout.GetHashCode().ToString(System.Globalization.CultureInfo.InvariantCulture), null, layout);
        }

        /// <summary>
        /// Gets the value of a given attribute by its name.
        /// </summary>
        /// <param name="chunk">The HTML chunk.</param>
        /// <param name="attributeName">Name of the attribute.</param>
        /// <returns></returns>
        protected virtual string GetAttributeValue(HtmlChunk chunk, string attributeName)
        {
            if (chunk != null)
            {
                var idx = Array.FindIndex(chunk.Attributes, 0, chunk.ParamsCount, i => i.Equals(attributeName, StringComparison.Ordinal));
                if (idx != -1)
                {
                    return chunk.Values[idx];
                }
            }

            return null;
        }
    }
}
