on run argv
    if (count of argv) is less than 3 then error "Missing TALK track-layout arguments."
    set videoTracksToAdd to item 1 of argv as integer
    set audioTracksToAdd to item 2 of argv as integer
    set audioAfterTrack to item 3 of argv as integer

    if videoTracksToAdd is 0 and audioTracksToAdd is 0 then return "ready"

    tell application "System Events"
        set premiereProcesses to every application process whose name starts with ¬
            "Adobe Premiere Pro"
        if (count of premiereProcesses) is 0 then error "Adobe Premiere Pro is not running."
        set premiereProcess to item 1 of premiereProcesses

        tell premiereProcess
            set frontmost to true
            try
                -- The host opened TALK-###. Focus its checked Timeline so the
                -- Sequence menu operates on that sequence.
                set timelinesMenu to menu "Timelines" of menu item "Timelines" of ¬
                    menu "Window" of menu bar item "Window" of menu bar 1
                repeat with timelineMenuItem in menu items of timelinesMenu
                    try
                        if (value of attribute "AXMenuItemMarkChar" of timelineMenuItem) is "✓" then
                            click timelineMenuItem
                            exit repeat
                        end if
                    end try
                end repeat
                delay 0.15

                click menu item "Add Tracks..." of menu "Sequence" of ¬
                    menu bar item "Sequence" of menu bar 1
                repeat with attempt from 1 to 100
                    if exists UI element "Add Tracks" then exit repeat
                    delay 0.1
                end repeat
                if not (exists UI element "Add Tracks") then ¬
                    error "Timed out waiting for Premiere's Add Tracks dialog."

                tell UI element "Add Tracks"
                    set videoAmountField to text field 1
                    set focused of videoAmountField to true
                    keystroke "a" using command down
                    keystroke (videoTracksToAdd as text)
                    if videoTracksToAdd > 0 then
                        set videoPlacementBox to combo box 1
                        perform action "AXPress" of videoPlacementBox
                        delay 0.1
                        keystroke "After Video 1"
                        key code 36
                    end if

                    set audioAmountField to text field 2
                    set focused of audioAmountField to true
                    keystroke "a" using command down
                    keystroke (audioTracksToAdd as text)
                    if audioTracksToAdd > 0 then
                        set audioPlacementBox to combo box 2
                        perform action "AXPress" of audioPlacementBox
                        delay 0.1
                        -- Reserve A1-A5 and shift all existing camera audio to
                        -- A6 and below without rebuilding or deleting it.
                        keystroke "Before First Track"
                        key code 36
                    end if

                    if (value of videoAmountField as integer) is not videoTracksToAdd then ¬
                        error "Premiere did not accept the video-track amount."
                    if (value of audioAmountField as integer) is not audioTracksToAdd then ¬
                        error "Premiere did not accept the audio-track amount."

                end tell
                -- AXPress can report an accessibility error because Premiere
                -- destroys the dialog immediately after accepting it. Treat a
                -- disappeared dialog as success; only propagate the error if
                -- the dialog is still open.
                try
                    tell UI element "Add Tracks" to perform action "AXPress" of ¬
                        (first button whose description is "OK")
                on error pressMessage number pressNumber
                    delay 0.25
                    if exists UI element "Add Tracks" then ¬
                        error pressMessage number pressNumber
                end try
                delay 0.2
            on error errorMessage number errorNumber
                try
                    if exists UI element "Add Tracks" then
                        tell UI element "Add Tracks" to perform action "AXPress" of ¬
                            (first button whose description is "Cancel")
                    end if
                end try
                error errorMessage number errorNumber
            end try
        end tell
    end tell

    return "ready"
end run
