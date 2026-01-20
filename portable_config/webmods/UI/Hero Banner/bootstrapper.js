/**
 * @name Dynamic Hero
 * @description Netflix-style rotating hero banner with catalog switching.
 * @version 2.13.0
 * @author allecsc
 *
 * MODULE REFACTOR
 * - Split into modules: config, utils, cache, state, api, ui, main
 * - Converted to Global Namespace pattern for compatibility
 * - Integrated with Metadata System (Passive Loading)
 */

// Hero Bootstrapper
(function() {
    const HeroBootstrapper = {
        checkDependencies: function() {
            return window.HeroPlugin && 
                   window.HeroPlugin.Config && 
                   window.HeroPlugin.State && 
                   window.HeroPlugin.Cache && 
                   window.HeroPlugin.catalogService && 
                   window.HeroPlugin.UI &&
                   window.HeroPlugin.Main;
        },

        checkMetadataReady: function() {
            return window.MetadataModules && window.MetadataModules.ready;
        },

        init: function() {
            console.log('[HeroBootstrapper] Waiting for dependencies...');
            this.waitForAll();
        },

        waitForAll: function(retryCount = 0) {
            // 1. Check internal Hero modules
            if (!this.checkDependencies()) {
                if (retryCount % 20 === 0) console.log('[HeroBootstrapper] Waiting for Hero modules...');
                setTimeout(() => this.waitForAll(retryCount + 1), 100);
                return;
            }

            // All ready
            this.launch();
        },

        launch: function() {
            if (this.launched) return;
            this.launched = true;

            console.log('[HeroBootstrapper] All systems ready. Launching Hero Plugin...');
            window.HeroPlugin.Main.init();
        }
    };

    // Start the bootstrapper
    HeroBootstrapper.init();
})();