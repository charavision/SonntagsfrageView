#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

static NSString * const AppVersion = @"1.0.15";
static NSString * const WebsiteURL = @"https://charavision.github.io/SonntagsfrageView/";

@interface AppDelegate : NSObject <NSApplicationDelegate, WKUIDelegate, WKScriptMessageHandler>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
    configuration.websiteDataStore = WKWebsiteDataStore.defaultDataStore;
    [configuration.userContentController addScriptMessageHandler:self name:@"refreshIntro"];
    NSString *bridge = @"window.MacApp={isSurfaceReady:function(){return true},refreshIntro:function(){window.webkit.messageHandlers.refreshIntro.postMessage(null)}};";
    [configuration.userContentController addUserScript:[[WKUserScript alloc] initWithSource:bridge injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];

    self.webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    self.webView.UIDelegate = self;
    self.webView.customUserAgent = [NSString stringWithFormat:@"SonntagsfragenMac/%@", AppVersion];
    [self.webView setValue:@NO forKey:@"drawsBackground"];

    NSRect frame = NSMakeRect(0, 0, 1240, 820);
    NSWindowStyleMask style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable | NSWindowStyleMaskFullSizeContentView;
    self.window = [[NSWindow alloc] initWithContentRect:frame styleMask:style backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"Sonntagsfragen";
    self.window.minSize = NSMakeSize(760, 560);
    self.window.backgroundColor = [NSColor colorWithRed:0.024 green:0.063 blue:0.125 alpha:1];
    self.window.contentView = self.webView;
    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    [self installMenu];
    [self loadLatest:@"startup"];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if ([message.name isEqualToString:@"refreshIntro"]) [self refreshWebContent];
}

- (nullable WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)navigationAction windowFeatures:(WKWindowFeatures *)windowFeatures {
    if (!navigationAction.targetFrame && navigationAction.request.URL) [NSWorkspace.sharedWorkspace openURL:navigationAction.request.URL];
    return nil;
}

- (void)refreshWebContent {
    NSSet *types = [NSSet setWithObjects:WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache, WKWebsiteDataTypeOfflineWebApplicationCache, nil];
    [WKWebsiteDataStore.defaultDataStore removeDataOfTypes:types modifiedSince:NSDate.distantPast completionHandler:^{
        dispatch_async(dispatch_get_main_queue(), ^{ [self loadLatest:@"intro"]; });
    }];
}

- (void)loadLatest:(NSString *)reason {
    NSURLComponents *components = [NSURLComponents componentsWithString:WebsiteURL];
    NSString *stamp = [NSString stringWithFormat:@"%@-%lld", reason, (long long)NSDate.date.timeIntervalSince1970];
    components.queryItems = @[[NSURLQueryItem queryItemWithName:@"macAppVersion" value:AppVersion], [NSURLQueryItem queryItemWithName:@"refresh" value:stamp]];
    NSURLRequest *request = [NSURLRequest requestWithURL:components.URL cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:30];
    [self.webView loadRequest:request];
}

- (void)reloadFromMenu:(id)sender { [self refreshWebContent]; }

- (void)installMenu {
    NSMenu *menu = [NSMenu new];
    NSMenuItem *appItem = [NSMenuItem new];
    [menu addItem:appItem];
    NSMenu *appMenu = [NSMenu new];
    [appMenu addItemWithTitle:@"Über Sonntagsfragen" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [appMenu addItem:NSMenuItem.separatorItem];
    NSMenuItem *reload = [appMenu addItemWithTitle:@"Aktuellen Stand laden" action:@selector(reloadFromMenu:) keyEquivalent:@"r"];
    reload.target = self;
    [appMenu addItem:NSMenuItem.separatorItem];
    [appMenu addItemWithTitle:@"Sonntagsfragen beenden" action:@selector(terminate:) keyEquivalent:@"q"];
    appItem.submenu = appMenu;
    NSApp.mainMenu = menu;
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *application = NSApplication.sharedApplication;
        AppDelegate *delegate = [AppDelegate new];
        application.delegate = delegate;
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        [application run];
    }
    return 0;
}
