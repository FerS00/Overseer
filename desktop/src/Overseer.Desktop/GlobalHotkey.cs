using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using Overseer.Desktop.Core;

namespace Overseer.Desktop;

/// <summary>System-wide shortcut registered with RegisterHotKey on the bar's window handle (works while the bar is hidden).</summary>
public sealed class GlobalHotkey : IDisposable
{
    private const int WmHotkey = 0x0312;
    private const uint ModAlt = 0x1, ModControl = 0x2, ModShift = 0x4, ModWin = 0x8, ModNoRepeat = 0x4000;
    private const int Id = 0x4F56; // "OV"
    private readonly IntPtr handle;
    private readonly HwndSource? source;
    private readonly Action pressed;

    public bool Registered { get; }

    public GlobalHotkey(Window window, Hotkey hotkey, Action pressed)
    {
        this.pressed = pressed;
        handle = new WindowInteropHelper(window).EnsureHandle();
        source = HwndSource.FromHwnd(handle);
        if (!Enum.TryParse<Key>(hotkey.Key, true, out var key)) return;
        var modifiers = ModNoRepeat | (hotkey.Control ? ModControl : 0) | (hotkey.Shift ? ModShift : 0) | (hotkey.Alt ? ModAlt : 0) | (hotkey.Windows ? ModWin : 0);
        Registered = RegisterHotKey(handle, Id, modifiers, (uint)KeyInterop.VirtualKeyFromKey(key));
        if (Registered) source?.AddHook(Hook);
    }

    private IntPtr Hook(IntPtr hwnd, int message, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (message != WmHotkey || wParam.ToInt32() != Id) return IntPtr.Zero;
        handled = true;
        pressed();
        return IntPtr.Zero;
    }

    public void Dispose()
    {
        if (!Registered) return;
        source?.RemoveHook(Hook);
        UnregisterHotKey(handle, Id);
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
}
