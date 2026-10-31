#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#define MAX_TRANSACTIONS 512
#define INPUT_LINE_SIZE 1024
#define ALERT_LINE_SIZE 2048
#define TRANSACTION_VALUE_SIZE 384

typedef struct {
    int transaction_id;
    char sender_account_id[40];
    char receiver_account_id[40];
    double amount;
    char timestamp[40];
    char status[20];
    char transaction_type[40];
} Transaction;

typedef struct {
    char entries[MAX_TRANSACTIONS][ALERT_LINE_SIZE];
    size_t front;
    size_t count;
} AlertQueue;

static int read_transactions(Transaction transactions[], size_t *count) {
    char line[INPUT_LINE_SIZE];
    *count = 0;

    while (fgets(line, sizeof line, stdin) != NULL) {
        char *fields[7];
        char *token;
        size_t field_count = 0;
        line[strcspn(line, "\r\n")] = '\0';
        if (line[0] == '\0') {
            continue;
        }
        if (*count >= MAX_TRANSACTIONS) {
            fprintf(stderr, "Input exceeds the %d-record limit.\n", MAX_TRANSACTIONS);
            return 0;
        }
        token = strtok(line, "|");
        while (token != NULL && field_count < 7) {
            fields[field_count++] = token;
            token = strtok(NULL, "|");
        }
        if (field_count != 7 || token != NULL) {
            fprintf(stderr, "Malformed transaction input: expected 7 pipe-delimited fields.\n");
            return 0;
        }

        char *end = NULL;
        long id = strtol(fields[0], &end, 10);
        if (end == fields[0] || *end != '\0' || id < 0 || id > 2147483647L) {
            fprintf(stderr, "Transaction ID must be a non-negative integer.\n");
            return 0;
        }
        double amount = strtod(fields[3], &end);
        if (end == fields[3] || *end != '\0' || !isfinite(amount) || amount < 0.0) {
            fprintf(stderr, "Transaction amount must be a non-negative number.\n");
            return 0;
        }
        if (strlen(fields[1]) >= sizeof transactions[*count].sender_account_id ||
            strlen(fields[2]) >= sizeof transactions[*count].receiver_account_id ||
            strlen(fields[4]) >= sizeof transactions[*count].timestamp ||
            strlen(fields[5]) >= sizeof transactions[*count].status ||
            strlen(fields[6]) >= sizeof transactions[*count].transaction_type) {
            fprintf(stderr, "A transaction field is longer than the supported input size.\n");
            return 0;
        }
        transactions[*count].transaction_id = (int)id;
        transactions[*count].amount = amount;
        strcpy(transactions[*count].sender_account_id, fields[1]);
        strcpy(transactions[*count].receiver_account_id, fields[2]);
        strcpy(transactions[*count].timestamp, fields[4]);
        strcpy(transactions[*count].status, fields[5]);
        strcpy(transactions[*count].transaction_type, fields[6]);
        (*count)++;
    }
    return 1;
}

static void print_transaction(const Transaction *transaction) {
    printf("%d|%s|%s|%.2f|%s|%s|%s\n",
           transaction->transaction_id,
           transaction->sender_account_id,
           transaction->receiver_account_id,
           transaction->amount,
           transaction->timestamp,
           transaction->status,
           transaction->transaction_type);
}

static const char *transaction_column_value(const Transaction *transaction, size_t column,
                                           char *buffer, size_t buffer_size) {
    switch (column) {
        case 0:
            snprintf(buffer, buffer_size, "%d", transaction->transaction_id);
            return buffer;
        case 1:
            return transaction->sender_account_id;
        case 2:
            return transaction->receiver_account_id;
        case 3:
            snprintf(buffer, buffer_size, "%.2f", transaction->amount);
            return buffer;
        case 4:
            return transaction->timestamp;
        case 5:
            return transaction->status;
        default:
            return transaction->transaction_type;
    }
}

static void print_transaction_border(const size_t widths[], size_t column_count) {
    for (size_t column = 0; column < column_count; column++) {
        putchar('+');
        for (size_t character = 0; character < widths[column] + 2; character++) {
            putchar('-');
        }
    }
    puts("+");
}

static void print_transaction_row(const char *values[], const size_t widths[], size_t column_count) {
    for (size_t column = 0; column < column_count; column++) {
        printf("| %-*s ", (int)widths[column], values[column]);
    }
    puts("|");
}

static void print_transaction_table(const char *title, const Transaction rows[], size_t count) {
    static const char *headers[] = {
        "ID", "Sender", "Receiver", "Amount", "Timestamp", "Status", "Type"
    };
    const size_t column_count = sizeof headers / sizeof headers[0];
    size_t widths[sizeof headers / sizeof headers[0]];

    for (size_t column = 0; column < column_count; column++) {
        widths[column] = strlen(headers[column]);
        for (size_t row = 0; row < count; row++) {
            char buffer[TRANSACTION_VALUE_SIZE];
            size_t value_length = strlen(transaction_column_value(
                &rows[row], column, buffer, sizeof buffer));
            if (value_length > widths[column]) {
                widths[column] = value_length;
            }
        }
    }
    if (count == 0 && widths[0] < strlen("No transactions")) {
        widths[0] = strlen("No transactions");
    }

    printf("\n=== %s ===\n", title);
    print_transaction_border(widths, column_count);
    print_transaction_row(headers, widths, column_count);
    print_transaction_border(widths, column_count);
    if (count == 0) {
        const char *values[sizeof headers / sizeof headers[0]] = {
            "No transactions", "", "", "", "", "", ""
        };
        print_transaction_row(values, widths, column_count);
    }
    for (size_t row = 0; row < count; row++) {
        const char *values[sizeof headers / sizeof headers[0]];
        char buffers[sizeof headers / sizeof headers[0]][TRANSACTION_VALUE_SIZE];
        for (size_t column = 0; column < column_count; column++) {
            values[column] = transaction_column_value(
                &rows[row], column, buffers[column], sizeof buffers[column]);
        }
        print_transaction_row(values, widths, column_count);
    }
    print_transaction_border(widths, column_count);
}

static int compare_transactions(const Transaction *left, const Transaction *right, const char *key) {
    if (strcmp(key, "amount") == 0) {
        return (left->amount > right->amount) - (left->amount < right->amount);
    }
    if (strcmp(key, "sender_account_id") == 0) {
        return strcmp(left->sender_account_id, right->sender_account_id);
    }
    return (left->transaction_id > right->transaction_id) -
           (left->transaction_id < right->transaction_id);
}

static void merge(Transaction rows[], Transaction buffer[], size_t start, size_t middle,
                  size_t end, const char *key, int descending) {
    size_t left = start;
    size_t right = middle;
    size_t output = start;
    while (left < middle && right < end) {
        int comparison = compare_transactions(&rows[left], &rows[right], key);
        int take_left = descending ? comparison >= 0 : comparison <= 0;
        if (take_left) {
            buffer[output++] = rows[left++];
        } else {
            buffer[output++] = rows[right++];
        }
    }
    while (left < middle) {
        buffer[output++] = rows[left++];
    }
    while (right < end) {
        buffer[output++] = rows[right++];
    }
    for (size_t index = start; index < end; index++) {
        rows[index] = buffer[index];
    }
}

static void merge_sort_range(Transaction rows[], Transaction buffer[], size_t start, size_t end,
                             const char *key, int descending) {
    if (end - start < 2) {
        return;
    }
    size_t middle = start + (end - start) / 2;
    merge_sort_range(rows, buffer, start, middle, key, descending);
    merge_sort_range(rows, buffer, middle, end, key, descending);
    merge(rows, buffer, start, middle, end, key, descending);
}

static int transaction_matches(const Transaction *transaction, const char *field, const char *needle) {
    if (strcmp(field, "sender_account_id") == 0) {
        return strcmp(transaction->sender_account_id, needle) == 0;
    }
    char id[16];
    snprintf(id, sizeof id, "%d", transaction->transaction_id);
    return strcmp(id, needle) == 0;
}

static int queue_push(AlertQueue *queue, const char *line) {
    if (queue->count == MAX_TRANSACTIONS) {
        fprintf(stderr, "Alert queue is full.\n");
        return 0;
    }
    size_t tail = (queue->front + queue->count) % MAX_TRANSACTIONS;
    if (strlen(line) >= ALERT_LINE_SIZE) {
        fprintf(stderr, "Alert record exceeds the supported input size.\n");
        return 0;
    }
    strcpy(queue->entries[tail], line);
    queue->count++;
    return 1;
}

static void queue_print_and_clear(AlertQueue *queue) {
    while (queue->count > 0) {
        puts(queue->entries[queue->front]);
        queue->front = (queue->front + 1) % MAX_TRANSACTIONS;
        queue->count--;
    }
}

int main(int argc, char *argv[]) {
    if (argc >= 2 && strcmp(argv[1], "queue") == 0) {
        AlertQueue queue = {{{0}}, 0, 0};
        char line[ALERT_LINE_SIZE];
        while (fgets(line, sizeof line, stdin) != NULL) {
            line[strcspn(line, "\r\n")] = '\0';
            if (line[0] != '\0' && !queue_push(&queue, line)) {
                return EXIT_FAILURE;
            }
        }
        queue_print_and_clear(&queue);
        return EXIT_SUCCESS;
    }

    Transaction transactions[MAX_TRANSACTIONS];
    size_t count = 0;
    if (!read_transactions(transactions, &count)) {
        return EXIT_FAILURE;
    }
    if (argc < 2) {
        fprintf(stderr, "Usage: bank_monitor <linear-field|binary-field|sort-key> [value|asc|desc]\n");
        return EXIT_FAILURE;
    }

    if (strncmp(argv[1], "sort-", 5) == 0) {
        const char *key = argv[1] + 5;
        if (strcmp(key, "amount") != 0 && strcmp(key, "transaction_id") != 0) {
            fprintf(stderr, "Sort key must be amount or transaction_id.\n");
            return EXIT_FAILURE;
        }
        if (argc >= 3 && strcmp(argv[2], "asc") != 0 && strcmp(argv[2], "desc") != 0) {
            fprintf(stderr, "Sort order must be asc or desc.\n");
            return EXIT_FAILURE;
        }
        int descending = argc >= 3 && strcmp(argv[2], "desc") == 0;
        Transaction original[MAX_TRANSACTIONS];
        memcpy(original, transactions, count * sizeof transactions[0]);
        Transaction buffer[MAX_TRANSACTIONS];
        merge_sort_range(transactions, buffer, 0, count, key, descending);
        if (argc >= 4 && strcmp(argv[3], "raw") == 0) {
            /* Machine-readable mode used by the Flask API: one pipe-delimited row per line. */
            for (size_t index = 0; index < count; index++) {
                print_transaction(&transactions[index]);
            }
            return EXIT_SUCCESS;
        }
        print_transaction_table("Original transactions", original, count);
        char title[80];
        snprintf(title, sizeof title, "Sorted by %s (%s)", key,
                 descending ? "descending" : "ascending");
        print_transaction_table(title, transactions, count);
        return EXIT_SUCCESS;
    }

    if (strncmp(argv[1], "linear-", 7) == 0 || strncmp(argv[1], "binary-", 7) == 0) {
        int is_binary = strncmp(argv[1], "binary-", 7) == 0;
        const char *field = argv[1] + 7;
        if (strcmp(field, "transaction_id") != 0 && strcmp(field, "sender_account_id") != 0) {
            fprintf(stderr, "Search field must be transaction_id or sender_account_id.\n");
            return EXIT_FAILURE;
        }
        if (argc < 3) {
            fprintf(stderr, "Search requires a value.\n");
            return EXIT_FAILURE;
        }
        if (is_binary) {
            Transaction buffer[MAX_TRANSACTIONS];
            merge_sort_range(transactions, buffer, 0, count, field, 0);
            int target_id = 0;
            if (strcmp(field, "transaction_id") == 0) {
                char *end = NULL;
                long parsed_id = strtol(argv[2], &end, 10);
                if (end == argv[2] || *end != '\0' || parsed_id < 0 || parsed_id > 2147483647L) {
                    fprintf(stderr, "Binary transaction ID must be between 0 and 2147483647.\n");
                    return EXIT_FAILURE;
                }
                target_id = (int)parsed_id;
            }
            size_t low = 0;
            size_t high = count;
            while (low < high) {
                size_t middle = low + (high - low) / 2;
                int comparison;
                if (strcmp(field, "sender_account_id") == 0) {
                    comparison = strcmp(transactions[middle].sender_account_id, argv[2]);
                } else {
                    comparison = (transactions[middle].transaction_id > target_id) -
                                 (transactions[middle].transaction_id < target_id);
                }
                if (comparison == 0) {
                    print_transaction(&transactions[middle]);
                    return EXIT_SUCCESS;
                }
                if (comparison < 0) {
                    low = middle + 1;
                } else {
                    high = middle;
                }
            }
            return EXIT_SUCCESS;
        }
        for (size_t index = 0; index < count; index++) {
            if (transaction_matches(&transactions[index], field, argv[2])) {
                print_transaction(&transactions[index]);
                return EXIT_SUCCESS;
            }
        }
        return EXIT_SUCCESS;
    }

    fprintf(stderr, "Unknown operation: %s\n", argv[1]);
    return EXIT_FAILURE;
}