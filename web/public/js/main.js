function validateUrl(value) {
    return /^(http:\/\/|https:\/\/)?(([a-zA-Z0-9]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-zA-Z0-9-]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*\.)+([a-zA-Z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]){2,6}\/?$/.test(value);
}

function setValidationForAddressEdit(id, bottom) {
    var timeout;

    $('#' + id).on('input', function () {
        if (timeout) {
            $('#' + id).popover('hide');

            clearTimeout(timeout);
            timeout = null;
        }
    });

    $('#' + id).parents('form:first').submit(function () {
        var st = $('#' + id).val();
        st = st.replace(/^\s+|\s+$/g, '');

        var error = null;
        if (!st)
            error = 'Please enter address';
        else if (!validateUrl(st))
            error = 'Invalid address';

        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }

        var _popover = $('#' + id).popover({
            trigger: 'manual',
            placement: bottom ? 'bottom' : 'top',
            content: error,
            template: '<div class=\'popover\'><div class=\'arrow\'></div><div class=\'popover-inner\'><div class=\'popover-content\'><p></p></div></div></div>'
        });

        $('#' + id).data('bs.popover').options.content = error;

        if (!error) {
            $('#' + id).popover('hide');
            return true;
        }

        $('#' + id).popover('show');
        timeout = setTimeout(function () {
            $('#' + id).popover('hide');
            timeout = null;
        }, 5000);

        return false;
    });
}

function updateDomainHistory(domain)
{
    // Changing list of domains
    var history = Cookies.get('history');
    var domains = [];
    if (history)
        domains = history.split(' ');

    if (domain) {
        var i = $.inArray(domain, domains);
        if (i != -1)
            domains.splice(i, 1);
        domains.splice(0, 0, domain);
    }

    if (domains.length > 7)
        domains.splice(7, domains.length - 7);

    Cookies.set('history', domains.join(' '), { expires: 90, path: '/' });

    // Updating UI
    var historyMenu = $('#domainHistory');
    historyMenu.empty();

    $.each(domains, function (index, value) {
        historyMenu.append($('<li>').append($('<a>').attr('href', '/map/' + value).text(value)));
    });

    if (domains.length == 0)
        historyMenu.append($('<li>').addClass('disabled').append($('<a>').attr('href', '#').text('No history')));

    $('li.disabled a').click(function (event) {
        event.preventDefault();
    });
}