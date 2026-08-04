on run argv
    if (count of argv) is less than 1 then error "Missing multicam sequence name."
    set sequenceName to item 1 of argv

    tell application "System Events"
        set premiereProcesses to every application process whose name starts with ¬
            "Adobe Premiere Pro"
        if (count of premiereProcesses) is 0 then error "Adobe Premiere Pro is not running."
        set premiereProcess to item 1 of premiereProcesses

        tell premiereProcess
            set frontmost to true
            try
                -- Bring the checked Project panel forward so Premiere enables
                -- the Clip command for the selection prepared by ExtendScript.
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

                click menu item "Create Multi-Camera Source Sequence..." of ¬
                    menu "Clip" of menu bar item "Clip" of menu bar 1

                repeat with attempt from 1 to 200
                    if exists UI element "Create Multi-Camera Source Sequence" then exit repeat
                    delay 0.1
                end repeat
                if not (exists UI element "Create Multi-Camera Source Sequence") then ¬
                    error "Timed out waiting for Premiere's multicam dialog."

                tell UI element "Create Multi-Camera Source Sequence"
                    -- Naming: Custom / INTRO-### or TALK-###.
                    set namingBox to combo box 1
                    perform action "AXPress" of namingBox
                    delay 0.1
                    keystroke "Custom"
                    key code 36
                    delay 0.15
                    if (value of namingBox as text) is not "Custom" then ¬
                        error "Premiere did not select Custom multicam naming."

                    set nameField to text field 1
                    set focused of nameField to true
                    keystroke "a" using command down
                    keystroke sequenceName
                    delay 0.15
                    if (value of nameField as text) is not sequenceName then ¬
                        error "Premiere did not accept multicam name: " & sequenceName

                    -- Synchronize Point: Audio track channel / channel 1.
                    set audioSyncRadio to first radio button whose description is ¬
                        "Audio track channel"
                    if value of audioSyncRadio is false then ¬
                        perform action "AXPress" of audioSyncRadio
                    delay 0.1

                    set channelBox to combo box 5
                    perform action "AXPress" of channelBox
                    delay 0.1
                    keystroke "1"
                    key code 36

                    -- Only the episode-specific values are changed. Premiere
                    -- retains its defaults for every other multicam option.
                    if value of audioSyncRadio is false then ¬
                        error "Audio track channel synchronization is not selected."
                    if (value of channelBox as text) is not "1" then ¬
                        error "Audio synchronization channel is not 1."

                    perform action "AXPress" of (first button whose description is "OK")
                end tell
                -- Once OK is pressed, Premiere owns the potentially long audio
                -- analysis job. The CEP host verifies the resulting sequence;
                -- avoid querying a dialog while Premiere is tearing it down.
                delay 0.2
            on error errorMessage number errorNumber
                try
                    if exists UI element "Create Multi-Camera Source Sequence" then
                        tell UI element "Create Multi-Camera Source Sequence" to ¬
                            perform action "AXPress" of ¬
                            (first button whose description is "Cancel")
                    end if
                end try
                error errorMessage number errorNumber
            end try
        end tell
    end tell

    return sequenceName
end run
