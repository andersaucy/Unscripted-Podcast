on run argv
    if (count of argv) is less than 1 then error "Missing Audio Channels preset name."
    set presetName to item 1 of argv

    tell application "System Events"
        set premiereProcesses to every application process whose name starts with ¬
            "Adobe Premiere Pro"
        if (count of premiereProcesses) is 0 then error "Adobe Premiere Pro is not running."
        set premiereProcess to item 1 of premiereProcesses

        tell premiereProcess
            set frontmost to true
            try
                -- setProjectViewSelection does not bring the Project panel to
                -- the front. Activate the checked project before invoking the
                -- Clip menu so Audio Channels is enabled for that selection.
                set projectsMenu to menu "Projects" of menu item "Projects" of ¬
                    menu "Window" of menu bar item "Window" of menu bar 1
                repeat with projectMenuItem in menu items of projectsMenu
                    try
                        if (value of attribute "AXMenuItemMarkChar" of projectMenuItem) is "✓" then
                            click projectMenuItem
                            exit repeat
                        end if
                    end try
                end repeat
                delay 0.15

                click menu item "Audio Channels..." of menu "Modify" of ¬
                    menu item "Modify" of menu "Clip" of ¬
                    menu bar item "Clip" of menu bar 1

                repeat with attempt from 1 to 200
                    if exists UI element "Modify Clip" then exit repeat
                    delay 0.1
                end repeat

                if not (exists UI element "Modify Clip") then ¬
                    error "Timed out waiting for Premiere's Modify Clip dialog."

                tell UI element "Modify Clip"
                    set presetBox to first combo box whose description is ¬
                        "Choose a preset audio channel configuration."
                    perform action "AXPress" of presetBox
                    delay 0.15

                    if not (exists first UI element of presetBox whose description is presetName) then ¬
                        error "Audio Channels preset not found: " & presetName

                    -- Premiere exposes preset rows as AXUnknown elements with
                    -- no actionable press operation. Its combo box does support
                    -- keyboard search, which selects the exact named preset.
                    keystroke presetName
                    key code 36 -- Return
                    delay 0.5

                    if (value of presetBox as text) is not presetName then ¬
                        error "Premiere did not select Audio Channels preset: " & presetName

                    perform action "AXPress" of (first button whose description is "OK")
                end tell
            on error errorMessage number errorNumber
                try
                    if exists UI element "Modify Clip" then
                        tell UI element "Modify Clip" to perform action "AXPress" of ¬
                            (first button whose description is "Cancel")
                    end if
                end try
                error errorMessage number errorNumber
            end try
        end tell
    end tell

    return presetName
end run
